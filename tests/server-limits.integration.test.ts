import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { SAMPLE_SETUP } from "../src/lib/catalog";
import { createSession } from "../src/lib/planner";

const state = vi.hoisted(() => ({
  pool: undefined as Pool | undefined,
  credit: vi.fn(),
  submit: vi.fn(),
  upload: vi.fn(),
  readAsset: vi.fn(),
}));
vi.mock("../src/lib/server/db", () => ({
  getPool: () => state.pool!,
  databaseConfigured: () => Boolean(state.pool),
  transaction: async (operation: (client: PoolClient) => Promise<unknown>) => {
    const client = await state.pool!.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
}));
vi.mock("../src/lib/youcam", async () => ({
  ...(await vi.importActual("../src/lib/youcam")),
  getCreditBalance: state.credit,
  submitMakeupTask: state.submit,
  uploadFile: state.upload,
}));
vi.mock("../src/lib/server/assets", async () => ({
  ...(await vi.importActual("../src/lib/server/assets")),
  readAssetBytes: state.readAsset,
}));

import {
  cancelSessionPreviews,
  failJob,
  queuePreviews,
} from "../src/lib/server/jobs";
import { markSessionDeleted, ownedSession } from "../src/lib/server/sessions";
import { reserveAIRequest } from "../src/lib/server/ai-input";
import {
  submitPreviewStep,
  uploadSourceStep,
} from "../src/workflows/preview-steps";

// Opt in with a dedicated local PostgreSQL URL. Each run creates and removes
// only its own random schema; production and remote databases are rejected.
const connectionString = process.env.TEST_DATABASE_URL;
if (
  connectionString &&
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(connectionString).hostname,
  )
)
  throw new Error("Integration tests require a local TEST_DATABASE_URL.");
const schema = `steady_test_${randomUUID().replaceAll("-", "")}`;
let admin: Pool | undefined;

async function seedSession(
  mode: "personal" | "sample" = "personal",
  owner = "owner-a",
) {
  const session = createSession(
    { ...structuredClone(SAMPLE_SETUP), mode, consent: true },
    randomUUID(),
  );
  session.sourceAssetId = randomUUID();
  session.selectedCandidateId = session.candidates[0].id;
  await state.pool!.query(
    "INSERT INTO studio_sessions(id,owner_id,revision,data) VALUES($1,$2,$3,$4::jsonb)",
    [session.id, owner, session.revision, JSON.stringify(session)],
  );
  return session;
}

describe.skipIf(!connectionString)(
  "PostgreSQL preview reservations and AI caps",
  () => {
    beforeAll(async () => {
      admin = new Pool({ connectionString, max: 1 });
      await admin.query(`CREATE SCHEMA ${schema}`);
      state.pool = new Pool({
        connectionString,
        max: 5,
        options: `-c search_path=${schema}`,
      });
      const activeSchema = await state.pool.query(
        "SELECT current_schema() AS name",
      );
      if (activeSchema.rows[0].name !== schema)
        throw new Error("Isolated test schema was not selected.");
      for (const file of (await readdir("migrations"))
        .filter((name) => name.endsWith(".sql"))
        .sort())
        await state.pool.query(await readFile(`migrations/${file}`, "utf8"));
      await state.pool.query(
        "INSERT INTO \"user\"(id,name,email) VALUES('owner-a','Test A','a@example.test'),('owner-b','Test B','b@example.test')",
      );
    });
    afterAll(async () => {
      await state.pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    beforeEach(async () => {
      vi.clearAllMocks();
      vi.stubEnv("YOUCAM_LIVE_ENABLED", "true");
      vi.stubEnv("YOUCAM_API_KEY", "test-key");
      vi.stubEnv("YOUCAM_API_BASE_URL", "https://api.example.test");
      vi.stubEnv("YOUCAM_BALANCE_FLOOR", "200");
      vi.stubEnv("YOUCAM_DAILY_JOB_LIMIT", "12");
      vi.stubEnv("YOUCAM_SESSION_JOB_LIMIT", "6");
      vi.stubEnv("YOUCAM_IP_DAILY_JOB_LIMIT", "8");
      vi.stubEnv("YOUCAM_ADAPTATION_DAILY_JOB_LIMIT", "2");
      vi.stubEnv("AI_HOURLY_REQUEST_LIMIT", "120");
      vi.stubEnv("AI_OWNER_HOURLY_REQUEST_LIMIT", "60");
      vi.stubEnv("AI_IP_HOURLY_REQUEST_LIMIT", "30");
      vi.stubEnv("BETTER_AUTH_SECRET", "test-salt");
      state.credit.mockResolvedValue(250);
      state.readAsset.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));
      state.upload.mockResolvedValue({ fileId: "prepared-fixture-file" });
      await state.pool!.query(
        "TRUNCATE studio_sessions,quota_reservations,provider_rate_windows,provider_credit_balances,ai_requests CASCADE",
      );
    });
    afterEach(() => vi.unstubAllEnvs());

    it("releases a failed upload reservation and permits an explicit new attempt within a cap of one", async () => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      vi.stubEnv("YOUCAM_SESSION_JOB_LIMIT", "1");
      const session = await seedSession();
      const first = await queuePreviews(
        "owner-a",
        session.id,
        session.revision,
        "ip-a",
        { variantId: "full" },
      );
      state.upload.mockRejectedValueOnce(
        new Error("Synthetic source upload failure"),
      );
      await expect(uploadSourceStep(first.jobs[0].id)).resolves.toBe(false);
      const released = await state.pool!.query(
        "SELECT released FROM quota_reservations WHERE id=$1",
        [first.jobs[0].id],
      );
      expect(released.rows[0].released).toBe(true);
      const current = await ownedSession("owner-a", session.id);
      const retry = await queuePreviews(
        "owner-a",
        session.id,
        current.revision,
        "ip-a",
        { variantId: "full" },
      );
      expect(retry.jobs).toHaveLength(1);
      expect(retry.jobs[0].id).not.toBe(first.jobs[0].id);
      await expect(uploadSourceStep(retry.jobs[0].id)).resolves.toBe(true);
      expect(
        (
          await state.pool!.query(
            "SELECT state,provider_file_id FROM provider_jobs WHERE id=$1",
            [retry.jobs[0].id],
          )
        ).rows[0],
      ).toMatchObject({
        state: "uploaded",
        provider_file_id: "prepared-fixture-file",
      });
      expect(state.upload).toHaveBeenCalledTimes(2);
      expect(state.submit).not.toHaveBeenCalled();
      const attempts = await state.pool!.query(
        "SELECT superseded_at FROM provider_jobs WHERE session_id=$1 ORDER BY created_at",
        [session.id],
      );
      expect(attempts.rows).toHaveLength(2);
      expect(attempts.rows[0].superseded_at).toBeInstanceOf(Date);
      const usage = await state.pool!.query(
        "SELECT count(*) FROM quota_reservations WHERE NOT released",
      );
      expect(usage.rows[0].count).toBe("1");
    });

    it("commits a partial chosen-method ladder and leaves the remaining level unrequested", async () => {
      vi.stubEnv("YOUCAM_SESSION_JOB_LIMIT", "2");
      const session = await seedSession();
      const result = await queuePreviews("owner-a", session.id, 0, "ip-a");
      expect(result.batch).toMatchObject({
        requested: 3,
        queued: 2,
        deferred: 1,
        remaining: 0,
      });
      expect(result.batch.message).toContain("daily allowance");
      expect(result.jobs.map((job) => job.input.variantId)).toEqual([
        "full",
        "light",
      ]);
      const saved = await ownedSession("owner-a", session.id);
      expect(saved.previewBatch).toEqual(result.batch);
      expect(
        saved.candidates[0].previewVariants?.find(
          (variant) => variant.id === "build",
        )?.previewStatus,
      ).toBe("not_requested");
      expect(
        saved.candidates
          .slice(1)
          .every((candidate) =>
            candidate.previewVariants?.every(
              (variant) => variant.previewStatus === "not_requested",
            ),
          ),
      ).toBe(true);
      expect(
        (await state.pool!.query("SELECT count(*) FROM provider_jobs")).rows[0]
          .count,
      ).toBe("2");
    });

    it("counts the owner allowance by database day across studios", async () => {
      for (let index = 0; index < 6; index++)
        await state.pool!.query(
          "INSERT INTO quota_reservations(id,owner_id,ip_hash,day) VALUES($1,'owner-a','ip-a',CURRENT_DATE-1)",
          [randomUUID()],
        );
      const first = await seedSession();
      expect(
        (await queuePreviews("owner-a", first.id, 0, "ip-a")).jobs,
      ).toHaveLength(3);
      const second = await seedSession();
      expect(
        (await queuePreviews("owner-a", second.id, 0, "ip-a")).jobs,
      ).toHaveLength(3);
      const third = await seedSession();
      await expect(
        queuePreviews("owner-a", third.id, 0, "ip-a", { variantId: "full" }),
      ).rejects.toMatchObject({ code: "PREVIEW_ALLOWANCE" });
    });

    it("retains ambiguous submission reservations and never creates a replacement paid attempt", async () => {
      const session = await seedSession();
      const first = await queuePreviews("owner-a", session.id, 0, "ip-a", {
        variantId: "full",
      });
      await state.pool!.query(
        "UPDATE provider_jobs SET submission_started_at=now() WHERE id=$1",
        [first.jobs[0].id],
      );
      await failJob(
        first.jobs[0].id,
        "unknown_submission",
        "The provider may have received this request.",
        true,
      );
      const current = await ownedSession("owner-a", session.id);
      const retry = await queuePreviews(
        "owner-a",
        session.id,
        current.revision,
        "ip-a",
        { variantId: "full" },
      );
      expect(retry.jobs).toEqual([]);
      expect(retry.session.candidates[0].previewRetryable).toBe(false);
      expect(
        (await state.pool!.query("SELECT count(*) FROM provider_jobs")).rows[0]
          .count,
      ).toBe("1");
      expect(
        (await state.pool!.query("SELECT released FROM quota_reservations"))
          .rows[0].released,
      ).toBe(false);
    });

    it("forbids fresh sample work on the server without reading the provider balance", async () => {
      const sample = await seedSession("sample");
      await expect(
        queuePreviews("owner-a", sample.id, 0, "ip-a"),
      ).rejects.toMatchObject({ code: "SAMPLE_PREVIEWS_RECORDED" });
      expect(state.credit).not.toHaveBeenCalled();
      expect(
        (await state.pool!.query("SELECT count(*) FROM quota_reservations"))
          .rows[0].count,
      ).toBe("0");
    });

    it("persists a below-floor snapshot even when fresh work is refused", async () => {
      state.credit.mockResolvedValue(199);
      const session = await seedSession();
      await expect(
        queuePreviews("owner-a", session.id, 0, "ip-a"),
      ).rejects.toMatchObject({ code: "LIVE_PREVIEWS_RESTING" });
      await expect(
        queuePreviews("owner-a", session.id, 0, "ip-a"),
      ).rejects.toMatchObject({ code: "LIVE_PREVIEWS_RESTING" });
      expect(state.credit).toHaveBeenCalledTimes(1);
      expect(
        (await state.pool!.query("SELECT count(*) FROM provider_jobs")).rows[0]
          .count,
      ).toBe("0");
    });

    it("checks the floor again before submission and releases a newly rested job", async () => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      const session = await seedSession();
      const queued = await queuePreviews("owner-a", session.id, 0, "ip-a", {
        variantId: "full",
      });
      const id = queued.jobs[0].id;
      await state.pool!.query(
        "UPDATE provider_jobs SET provider_file_id='prepared-file',state='uploaded' WHERE id=$1",
        [id],
      );
      await state.pool!.query(
        "UPDATE provider_credit_balances SET checked_at=now()-interval '6 minutes'",
      );
      state.credit.mockResolvedValue(199);
      await expect(submitPreviewStep(id)).resolves.toBe(false);
      expect(state.submit).not.toHaveBeenCalled();
      const job = (
        await state.pool!.query(
          "SELECT state,submission_started_at FROM provider_jobs WHERE id=$1",
          [id],
        )
      ).rows[0];
      expect(job).toMatchObject({
        state: "failed",
        submission_started_at: null,
      });
      expect(
        (
          await state.pool!.query(
            "SELECT released FROM quota_reservations WHERE id=$1",
            [id],
          )
        ).rows[0].released,
      ).toBe(true);
    });

    it("serializes concurrent anonymous owners against the app-wide AI cap", async () => {
      vi.stubEnv("AI_HOURLY_REQUEST_LIMIT", "2");
      vi.stubEnv("VERCEL", "1");
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, (_, index) =>
          reserveAIRequest(
            `anonymous-${index}`,
            "inspiration",
            new Request("https://steady.example/api/inspiration", {
              headers: { "x-vercel-forwarded-for": `192.0.2.${index + 1}` },
            }),
          ),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(2);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(2);
      expect(
        (await state.pool!.query("SELECT count(*) FROM ai_requests")).rows[0]
          .count,
      ).toBe("2");
    });

    it("releases only unsubmitted reservations when a studio is deleted", async () => {
      const session = await seedSession();
      const queued = await queuePreviews("owner-a", session.id, 0, "ip-a");
      await state.pool!.query(
        "UPDATE provider_jobs SET submission_started_at=now(),state='unknown_submission' WHERE id=$1",
        [queued.jobs[1].id],
      );
      await state.pool!.query(
        "UPDATE provider_jobs SET submission_started_at=now(),provider_task_id='confirmed-task',state='waiting' WHERE id=$1",
        [queued.jobs[2].id],
      );
      await markSessionDeleted("owner-a", session.id);
      const rows = await state.pool!.query(
        "SELECT id,released FROM quota_reservations ORDER BY id",
      );
      expect(
        rows.rows.find((row) => row.id === queued.jobs[0].id).released,
      ).toBe(true);
      expect(
        rows.rows.find((row) => row.id === queued.jobs[1].id).released,
      ).toBe(false);
      expect(
        rows.rows.find((row) => row.id === queued.jobs[2].id).released,
      ).toBe(false);
    });

    it("stops a queued preview before paid submission and returns its reservation", async () => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      const session = await seedSession();
      const queued = await queuePreviews("owner-a", session.id, 0, "ip-a", {
        variantId: "full",
      });
      const id = queued.jobs[0].id;
      await state.pool!.query(
        "UPDATE provider_jobs SET provider_file_id='prepared-file',state='uploaded' WHERE id=$1",
        [id],
      );
      await state.pool!.query(
        "UPDATE studio_sessions SET data=jsonb_set(data,'{stage}','\"stopped\"') WHERE id=$1",
        [session.id],
      );
      await expect(submitPreviewStep(id)).resolves.toBe(false);
      expect(state.submit).not.toHaveBeenCalled();
      expect(
        (
          await state.pool!.query(
            "SELECT state,submission_started_at FROM provider_jobs WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toMatchObject({ state: "cancelled", submission_started_at: null });
      expect(
        (
          await state.pool!.query(
            "SELECT released FROM quota_reservations WHERE id=$1",
            [id],
          )
        ).rows[0].released,
      ).toBe(true);
    });

    it("limits extra Light previews during application to two per owner per day", async () => {
      for (let index = 0; index < 3; index++) {
        const session = await seedSession();
        session.stage = "applying";
        session.activePlan = structuredClone(session.candidates[0]);
        await state.pool!.query(
          "UPDATE studio_sessions SET data=$2::jsonb WHERE id=$1",
          [session.id, JSON.stringify(session)],
        );
        const request = queuePreviews("owner-a", session.id, 0, "ip-a", {
          variantId: "light",
        });
        if (index < 2) expect((await request).jobs).toHaveLength(1);
        else
          await expect(request).rejects.toMatchObject({
            code: "PREVIEW_ALLOWANCE",
          });
      }
    });

    it("keeps uncertain pending spend reserved after a balance-cache refresh", async () => {
      state.credit.mockResolvedValue(201);
      const first = await seedSession();
      const queued = await queuePreviews("owner-a", first.id, 0, "ip-a", {
        variantId: "full",
      });
      await state.pool!.query(
        "UPDATE provider_jobs SET submission_started_at=now(),state='unknown_submission' WHERE id=$1",
        [queued.jobs[0].id],
      );
      await state.pool!.query(
        "UPDATE provider_credit_balances SET checked_at=now()-interval '6 minutes'",
      );
      const second = await seedSession();
      await expect(
        queuePreviews("owner-a", second.id, 0, "ip-a", { variantId: "full" }),
      ).rejects.toMatchObject({ code: "LIVE_PREVIEWS_RESTING" });
      expect(
        (await state.pool!.query("SELECT count(*) FROM provider_jobs")).rows[0]
          .count,
      ).toBe("1");
    });

    it("can stop an interrupted known task while retaining its paid reservation", async () => {
      const session = await seedSession();
      const queued = await queuePreviews("owner-a", session.id, 0, "ip-a", {
        variantId: "full",
      });
      await state.pool!.query(
        "UPDATE provider_jobs SET provider_task_id='known-task',submission_started_at=now(),state='unknown_submission' WHERE id=$1",
        [queued.jobs[0].id],
      );
      const stopped = await cancelSessionPreviews("owner-a", session.id);
      expect(stopped.candidates[0]).toMatchObject({
        previewStatus: "cancelled",
        previewRetryable: false,
      });
      expect(stopped.previewBatch).toBeUndefined();
      expect(
        (
          await state.pool!.query(
            "SELECT state,cancel_requested FROM provider_jobs WHERE id=$1",
            [queued.jobs[0].id],
          )
        ).rows[0],
      ).toMatchObject({ state: "cancelled", cancel_requested: true });
      expect(
        (
          await state.pool!.query(
            "SELECT released FROM quota_reservations WHERE id=$1",
            [queued.jobs[0].id],
          )
        ).rows[0].released,
      ).toBe(false);
    });
  },
);
