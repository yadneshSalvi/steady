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
import { EYE_SAMPLE_SETUP, SAMPLE_SETUP } from "../src/lib/catalog";
import type {
  PreviewLevel,
  SetupInput,
  StudioSession,
} from "../src/lib/contracts";
import {
  applicationPreviewTarget,
  applyCommand,
  createSession,
  currentAction,
} from "../src/lib/planner";
import { selectPreviewLevel, softerRecipe } from "../src/lib/youcam/recipes";

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
  setPreviewStatus,
} from "../src/lib/server/jobs";
import {
  markSessionDeleted,
  mutateSession,
  ownedSession,
} from "../src/lib/server/sessions";
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
  setup: SetupInput = SAMPLE_SETUP,
) {
  const session = createSession(
    { ...structuredClone(setup), mode, consent: true },
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

async function storeFixture(session: StudioSession) {
  await state.pool!.query(
    "UPDATE studio_sessions SET revision=$2,data=$3::jsonb WHERE id=$1",
    [session.id, session.revision, JSON.stringify(session)],
  );
  return ownedSession("owner-a", session.id);
}

async function adaptedFixture(
  eyes: boolean,
  level: PreviewLevel = "full",
  accepted = false,
) {
  let session = createSession(
    {
      ...structuredClone(eyes ? EYE_SAMPLE_SETUP : SAMPLE_SETUP),
      mode: "personal",
      consent: true,
    },
    randomUUID(),
  );
  session.sourceAssetId = randomUUID();
  const candidateId = session.candidates[0].id;
  session = applyCommand(session, {
    type: "select_preview_level",
    candidateId,
    level,
  });
  session = applyCommand(session, { type: "approve_candidate", candidateId });
  session = applyCommand(session, { type: "start" });
  const actionId = currentAction(session)!.id;
  session = applyCommand(session, { type: "checkpoint", actionId });
  session = applyCommand(session, { type: "complete_action", actionId });
  session = applyCommand(session, {
    type: "propose_adaptation",
    reason: "movement",
    routeId: eyes ? "shadow" : "sweep",
  });
  if (accepted)
    session = applyCommand(session, {
      type: "accept_adaptation",
      proposalId: session.adaptation!.id,
    });
  await state.pool!.query(
    "INSERT INTO studio_sessions(id,owner_id,revision,data) VALUES($1,'owner-a',$2,$3::jsonb)",
    [session.id, session.revision, JSON.stringify(session)],
  );
  return ownedSession("owner-a", session.id);
}

function physicalHistory(session: StudioSession) {
  return JSON.stringify({
    actions: session.activePlan!.actions.filter((action) =>
      session.completedActionIds.includes(action.id),
    ),
    completedActionIds: session.completedActionIds,
    observations: session.observations,
  });
}

/** Database-only output metadata tests projection; no provider or Blob request. */
async function completeFixturePreview(jobId: string) {
  const job = (
    await state.pool!.query("SELECT * FROM provider_jobs WHERE id=$1", [jobId])
  ).rows[0];
  const assetId = randomUUID();
  await state.pool!.query(
    "INSERT INTO studio_assets(id,owner_id,session_id,pathname,purpose,provenance,content_type,bytes,checksum,width,height) VALUES($1,$2,$3,$4,'preview','virtual_preview','image/png',1,'fixture-only',1024,1280)",
    [assetId, job.owner_id, job.session_id, `fixture-only/${assetId}.png`],
  );
  await state.pool!.query(
    "UPDATE provider_jobs SET state='succeeded',output_asset_id=$2,provider_task_id='fixture-known-task',submission_started_at=now() WHERE id=$1",
    [jobId, assetId],
  );
  await setPreviewStatus(jobId, "ready");
  return assetId;
}

function commandFixture(
  session: StudioSession,
  command: Parameters<typeof mutateSession>[3],
) {
  return mutateSession("owner-a", session.id, session.revision, command);
}

function queueApplicationFixture(session: StudioSession) {
  return queuePreviews(
    "owner-a",
    session.id,
    session.revision,
    "ip-a",
    applicationPreviewTarget(session),
  );
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

    it("limits selected application targets to two per owner per day even when configured higher", async () => {
      vi.stubEnv("YOUCAM_ADAPTATION_DAILY_JOB_LIMIT", "10");
      const levels = ["full", "build", "light"] as const;
      for (let index = 0; index < 3; index++) {
        const session = await seedSession();
        selectPreviewLevel(session.candidates[0], levels[index]);
        session.stage = "applying";
        session.activePlan = structuredClone(session.candidates[0]);
        await state.pool!.query(
          "UPDATE studio_sessions SET data=$2::jsonb WHERE id=$1",
          [session.id, JSON.stringify(session)],
        );
        const request = queuePreviews("owner-a", session.id, 0, "ip-a", {
          variantId: levels[index],
        });
        if (index < 2) expect((await request).jobs).toHaveLength(1);
        else
          await expect(request).rejects.toMatchObject({
            code: "PREVIEW_ALLOWANCE",
          });
      }
    });

    it("makes the selected Full shadow target ready before accepting while preserving the completed liner eye", async () => {
      const session = await adaptedFixture(true);
      const history = physicalHistory(session);
      const observations = JSON.stringify(session.observations);
      const result = await queuePreviews(
        "owner-a",
        session.id,
        session.revision,
        "ip-a",
      );
      expect(result.batch).toMatchObject({
        requested: 1,
        queued: 1,
        deferred: 0,
      });
      expect(result.jobs[0].input).toMatchObject({
        purpose: "adaptation",
        variantId: "full",
        effects: session.adaptation!.candidate.recipe,
      });
      const assetId = await completeFixturePreview(result.jobs[0].id);
      let saved = await ownedSession("owner-a", session.id);
      expect(saved.adaptation!.candidate).toMatchObject({
        selectedPreviewVariantId: "full",
        previewStatus: "ready",
        previewAsset: { id: assetId },
      });
      expect(
        saved.adaptation!.candidate.previewVariants!.find(
          (variant) => variant.id === "light",
        )!.previewStatus,
      ).toBe("not_requested");
      saved = await mutateSession("owner-a", session.id, saved.revision, {
        type: "accept_adaptation",
        proposalId: saved.adaptation!.id,
      });
      for (const copy of [saved.activePlan!, saved.candidates[0]])
        expect(copy).toMatchObject({
          selectedPreviewVariantId: "full",
          previewStatus: "ready",
          previewAsset: { id: assetId },
          recipe: result.jobs[0].input.effects,
        });
      expect(physicalHistory(saved)).toBe(history);
      expect(JSON.stringify(saved.observations)).toBe(observations);
      expect(state.submit).not.toHaveBeenCalled();
    });

    it("generates the accepted powder recipe at Build without changing the completed cream cheek or its snapshots", async () => {
      const session = await adaptedFixture(false, "build", true);
      const history = physicalHistory(session);
      const events = JSON.stringify(session.events);
      expect(session.goalChanged).toBe(false);
      const target = applicationPreviewTarget(session)!;
      const result = await queuePreviews(
        "owner-a",
        session.id,
        session.revision,
        "ip-a",
        target,
      );
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].input).toMatchObject({
        variantId: "build",
        purpose: "adaptation",
        effects: session.activePlan!.recipe,
      });
      const assetId = await completeFixturePreview(result.jobs[0].id);
      const saved = await ownedSession("owner-a", session.id);
      for (const copy of [saved.activePlan!, saved.candidates[0]]) {
        expect(copy).toMatchObject({
          selectedPreviewVariantId: "build",
          previewStatus: "ready",
          previewAsset: { id: assetId },
        });
        expect(copy.recipe[1].palettes).toEqual([
          expect.objectContaining({ texture: "matte", colorIntensity: 45 }),
        ]);
      }
      expect(saved.activePlan!.actions[0].product).toBe("cream_blush");
      expect(saved.activePlan!.actions[1].product).toBe("powder_blush");
      expect(physicalHistory(saved)).toBe(history);
      expect(JSON.stringify(saved.events)).toBe(events);
      expect(state.submit).not.toHaveBeenCalled();
    });

    it("rejects inactive and off-selection application requests and serializes concurrent valid requests", async () => {
      const session = await adaptedFixture(true);
      const target = applicationPreviewTarget(session)!;
      for (const options of [
        { ...target, candidateId: session.activePlan!.id },
        { ...target, variantId: "light" as const },
      ])
        await expect(
          queuePreviews(
            "owner-a",
            session.id,
            session.revision,
            "ip-a",
            options,
          ),
        ).rejects.toMatchObject({ code: "PREVIEW_STAGE" });
      expect(state.credit).not.toHaveBeenCalled();
      const outcomes = await Promise.allSettled([
        queuePreviews("owner-a", session.id, session.revision, "ip-a", target),
        queuePreviews("owner-a", session.id, session.revision, "ip-a", target),
      ]);
      expect(
        outcomes.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = outcomes.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: { code: "REVISION_CONFLICT" },
      });
      expect(
        (await state.pool!.query("SELECT count(*) FROM provider_jobs")).rows[0]
          .count,
      ).toBe("1");
      expect(
        (
          await state.pool!.query(
            "SELECT count(*) FROM quota_reservations WHERE NOT released",
          )
        ).rows[0].count,
      ).toBe("1");
      expect(state.submit).not.toHaveBeenCalled();
    });

    it("recovers an exact known task under a repaired candidate without changing its recipe or paying again", async () => {
      const session = await seedSession();
      const queued = await queuePreviews("owner-a", session.id, 0, "ip-a", {
        variantId: "full",
      });
      const job = queued.jobs[0];
      await state.pool!.query(
        "UPDATE provider_jobs SET state='failed',error_code='workflow_interrupted',provider_task_id='known-task',submission_started_at=now() WHERE id=$1",
        [job.id],
      );
      const original = (
        await state.pool!.query(
          "SELECT candidate_id,input,request_hash FROM provider_jobs WHERE id=$1",
          [job.id],
        )
      ).rows[0];
      let saved = await ownedSession("owner-a", session.id);
      const commands = [
        { type: "approve_candidate", candidateId: saved.candidates[0].id },
        { type: "start" },
      ] as const;
      for (const command of commands)
        saved = await mutateSession(
          "owner-a",
          saved.id,
          saved.revision,
          command,
        );
      const actionId = currentAction(saved)!.id;
      saved = await mutateSession("owner-a", saved.id, saved.revision, {
        type: "complete_action",
        actionId,
      });
      saved = await mutateSession("owner-a", saved.id, saved.revision, {
        type: "propose_adaptation",
        reason: "tool",
        routeId: "sponge",
      });
      const history = physicalHistory(saved);
      const recovered = await queuePreviews(
        "owner-a",
        saved.id,
        saved.revision,
        "ip-a",
        applicationPreviewTarget(saved),
      );
      expect(recovered.jobs).toHaveLength(1);
      expect(recovered.jobs[0]).toMatchObject({
        id: job.id,
        candidate_id: original.candidate_id,
        provider_task_id: "known-task",
        state: "waiting",
      });
      expect(
        (
          await state.pool!.query(
            "SELECT candidate_id,input,request_hash FROM provider_jobs WHERE id=$1",
            [job.id],
          )
        ).rows[0],
      ).toEqual(original);
      expect(
        (await state.pool!.query("SELECT count(*) FROM quota_reservations"))
          .rows[0].count,
      ).toBe("1");
      const assetId = await completeFixturePreview(job.id);
      const projected = await ownedSession("owner-a", session.id);
      expect(projected.adaptation!.candidate).toMatchObject({
        previewStatus: "ready",
        previewAsset: { id: assetId },
        selectedPreviewVariantId: "full",
      });
      expect(physicalHistory(projected)).toBe(history);
      expect(state.submit).not.toHaveBeenCalled();
    });

    it.each(["queued", "succeeded"] as const)(
      "rebinds the selected %s target from a partial ladder after method repair without reserving another unit",
      async (priorState) => {
        vi.stubEnv("YOUCAM_SESSION_JOB_LIMIT", "2");
        const session = await seedSession();
        const partial = await queuePreviews("owner-a", session.id, 0, "ip-a");
        expect(partial.batch.deferred).toBe(1);
        let saved = partial.session;
        saved = applyCommand(saved, {
          type: "approve_candidate",
          candidateId: saved.candidates[0].id,
        });
        saved = applyCommand(saved, { type: "start" });
        saved = applyCommand(saved, {
          type: "complete_action",
          actionId: currentAction(saved)!.id,
        });
        saved = applyCommand(saved, {
          type: "propose_adaptation",
          reason: "tool",
          routeId: "sponge",
        });
        saved = await storeFixture(saved);
        const history = physicalHistory(saved);
        const assetId =
          priorState === "succeeded"
            ? await completeFixturePreview(partial.jobs[0].id)
            : undefined;
        if (assetId) {
          // The old card's recovered output advances the studio revision.
          // A stale request must reload before binding it to the repair.
          await expect(
            queuePreviews(
              "owner-a",
              saved.id,
              saved.revision,
              "ip-a",
              applicationPreviewTarget(saved),
            ),
          ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
          saved = await ownedSession("owner-a", saved.id);
        }
        const result = await queuePreviews(
          "owner-a",
          saved.id,
          saved.revision,
          "ip-a",
          applicationPreviewTarget(saved),
        );
        expect(result.jobs.map((job) => job.id)).toEqual(
          priorState === "queued" ? [partial.jobs[0].id] : [],
        );
        expect(result.session.adaptation!.candidate).toMatchObject({
          previewStatus: priorState === "queued" ? "queued" : "ready",
          previewJobId: partial.jobs[0].id,
          selectedPreviewVariantId: "full",
        });
        if (assetId)
          expect(result.session.adaptation!.candidate.previewAsset?.id).toBe(
            assetId,
          );
        expect(result.batch).toMatchObject({
          requested: 1,
          queued: priorState === "queued" ? 1 : 0,
          deferred: 0,
        });
        expect(physicalHistory(result.session)).toBe(history);
        expect(
          (await state.pool!.query("SELECT count(*) FROM provider_jobs"))
            .rows[0].count,
        ).toBe("2");
        expect(
          (
            await state.pool!.query(
              "SELECT count(*) FROM quota_reservations WHERE NOT released",
            )
          ).rows[0].count,
        ).toBe("2");
        expect(state.submit).not.toHaveBeenCalled();
      },
    );

    it("releases a never-submitted adapted target and makes an explicit retry ready within a cap of one", async () => {
      vi.stubEnv("YOUCAM_ADAPTATION_DAILY_JOB_LIMIT", "1");
      const session = await adaptedFixture(true, "full", true);
      const history = physicalHistory(session);
      const first = await queuePreviews(
        "owner-a",
        session.id,
        session.revision,
        "ip-a",
        applicationPreviewTarget(session),
      );
      await failJob(
        first.jobs[0].id,
        "upload_failed",
        "Fixture upload stopped before submission.",
        false,
        true,
      );
      const saved = await ownedSession("owner-a", session.id);
      expect(saved.activePlan).toMatchObject({
        previewStatus: "failed",
        previewRetryable: true,
      });
      const retry = await queuePreviews(
        "owner-a",
        saved.id,
        saved.revision,
        "ip-a",
        applicationPreviewTarget(saved),
      );
      expect(retry.jobs).toHaveLength(1);
      expect(retry.jobs[0].id).not.toBe(first.jobs[0].id);
      expect(retry.jobs[0].input.variantId).toBe("full");
      const assetId = await completeFixturePreview(retry.jobs[0].id);
      const current = await ownedSession("owner-a", session.id);
      expect(current.activePlan).toMatchObject({
        previewStatus: "ready",
        previewAsset: { id: assetId },
      });
      expect(physicalHistory(current)).toBe(history);
      expect(
        (
          await state.pool!.query(
            "SELECT released FROM quota_reservations ORDER BY created_at",
          )
        ).rows.map((row) => row.released),
      ).toEqual([true, false]);
      expect(state.submit).not.toHaveBeenCalled();
    });

    it("retains an ambiguous adapted recipe attempt without replacing it or switching the selected level", async () => {
      const session = await adaptedFixture(false, "build", true);
      const history = physicalHistory(session);
      const first = await queuePreviews(
        "owner-a",
        session.id,
        session.revision,
        "ip-a",
        applicationPreviewTarget(session),
      );
      await state.pool!.query(
        "UPDATE provider_jobs SET submission_started_at=now() WHERE id=$1",
        [first.jobs[0].id],
      );
      await failJob(
        first.jobs[0].id,
        "unknown_submission",
        "Fixture ambiguous submission.",
        true,
      );
      const saved = await ownedSession("owner-a", session.id);
      const retry = await queuePreviews(
        "owner-a",
        saved.id,
        saved.revision,
        "ip-a",
        applicationPreviewTarget(saved),
      );
      expect(retry.jobs).toEqual([]);
      expect(retry.session.activePlan).toMatchObject({
        selectedPreviewVariantId: "build",
        previewStatus: "failed",
        previewRetryable: false,
      });
      expect(physicalHistory(retry.session)).toBe(history);
      expect(
        (await state.pool!.query("SELECT count(*) FROM provider_jobs")).rows[0]
          .count,
      ).toBe("1");
      expect(
        (await state.pool!.query("SELECT released FROM quota_reservations"))
          .rows[0].released,
      ).toBe(false);
      expect(state.submit).not.toHaveBeenCalled();
    });

    it("leaves the exact adapted selection and completed history saved when the floor refuses a new target", async () => {
      state.credit.mockResolvedValue(199);
      const session = await adaptedFixture(false, "build", true);
      const before = JSON.stringify(session);
      await expect(
        queuePreviews(
          "owner-a",
          session.id,
          session.revision,
          "ip-a",
          applicationPreviewTarget(session),
        ),
      ).rejects.toMatchObject({ code: "LIVE_PREVIEWS_RESTING" });
      expect(JSON.stringify(await ownedSession("owner-a", session.id))).toBe(
        before,
      );
      expect(
        (await state.pool!.query("SELECT count(*) FROM provider_jobs")).rows[0]
          .count,
      ).toBe("0");
      expect(state.submit).not.toHaveBeenCalled();
    });

    it.each(["light", undefined] as const)(
      "recovers an exact historical %s job for a legacy Full-addressed softer recipe without relabeling the paid request",
      async (historicalLevel) => {
        const initial = await seedSession();
        const powder = initial.candidates.find(
          (candidate) => candidate.routeId === "sweep",
        )!;
        const first = await queuePreviews(
          "owner-a",
          initial.id,
          initial.revision,
          "ip-a",
          {
            candidateId: powder.id,
            variantId: "light",
          },
        );
        const jobId = first.jobs[0].id;
        let session = applyCommand(first.session, {
          type: "approve_candidate",
          candidateId: powder.id,
        });
        session = applyCommand(session, { type: "start" });
        session = applyCommand(session, {
          type: "checkpoint",
          actionId: currentAction(session)!.id,
        });
        session = applyCommand(session, {
          type: "propose_adaptation",
          reason: "softer",
        });
        session = applyCommand(session, {
          type: "accept_adaptation",
          proposalId: session.adaptation!.id,
        });
        // b01448a persisted approved softerRecipe(...)=25 targets before
        // planner/state had ladder or selected-level fields. Keep that exact
        // supported representation while the durable job retains its history.
        for (const copy of [session.activePlan!, session.candidates[0]]) {
          expect(copy.recipe).toEqual(softerRecipe(powder.recipe));
          delete copy.previewVariants;
          delete copy.selectedPreviewVariantId;
        }
        session = await storeFixture(session);
        const history = physicalHistory(session);
        await state.pool!.query(
          "UPDATE provider_jobs SET state='failed',error_code='workflow_interrupted',provider_task_id='fixture-known-task',submission_started_at=now(),input=CASE WHEN $2::boolean THEN input-'variantId' ELSE input END WHERE id=$1",
          [jobId, historicalLevel === undefined],
        );
        const original = (
          await state.pool!.query(
            "SELECT candidate_id,input,request_hash,provider_task_id FROM provider_jobs WHERE id=$1",
            [jobId],
          )
        ).rows[0];
        vi.stubEnv("YOUCAM_ADAPTATION_DAILY_JOB_LIMIT", "0");
        state.credit.mockClear();
        const resumed = await queuePreviews(
          "owner-a",
          session.id,
          session.revision,
          "ip-a",
          applicationPreviewTarget(session),
        );
        expect(resumed.jobs.map((job) => job.id)).toEqual([jobId]);
        expect(resumed.session.activePlan).toMatchObject({
          selectedPreviewVariantId: "full",
          previewStatus: "processing",
          recipe: session.activePlan!.recipe,
        });
        const assetId = await completeFixturePreview(jobId);
        const saved = await ownedSession("owner-a", session.id);
        for (const copy of [saved.activePlan!, saved.candidates[0]])
          expect(copy).toMatchObject({
            selectedPreviewVariantId: "full",
            recipe: session.activePlan!.recipe,
            previewStatus: "ready",
            previewAsset: { id: assetId },
          });
        expect(
          (
            await state.pool!.query(
              "SELECT candidate_id,input,request_hash,provider_task_id FROM provider_jobs WHERE id=$1",
              [jobId],
            )
          ).rows[0],
        ).toEqual(original);
        expect(
          (await state.pool!.query("SELECT count(*) FROM provider_jobs"))
            .rows[0].count,
        ).toBe("1");
        expect(
          (
            await state.pool!.query(
              "SELECT count(*) FROM quota_reservations WHERE NOT released",
            )
          ).rows[0].count,
        ).toBe("1");
        expect(physicalHistory(saved)).toBe(history);
        expect(state.credit).not.toHaveBeenCalled();
        expect(state.submit).not.toHaveBeenCalled();
      },
    );

    it.each(["cheek", "eye"] as const)(
      "generates a legacy approved %s recipe exactly without rebuilding it from the current catalog",
      async (goal) => {
        let session =
          goal === "eye"
            ? await adaptedFixture(true, "full", true)
            : await seedSession();
        if (goal === "cheek") {
          session = applyCommand(session, {
            type: "approve_candidate",
            candidateId: session.candidates[0].id,
          });
          session = applyCommand(session, { type: "start" });
        }
        const candidate = session.activePlan!;
        for (const copy of [candidate, session.candidates[0]]) {
          delete copy.previewVariants;
          delete copy.selectedPreviewVariantId;
          const palette = (
            copy.recipe[1].palettes as { [key: string]: string | number }[]
          )[0];
          if (goal === "cheek") palette.glowStrength = 0;
        }
        session = await storeFixture(session);
        const recipe = structuredClone(session.activePlan!.recipe);
        const result = await queuePreviews(
          "owner-a",
          session.id,
          session.revision,
          "ip-a",
          applicationPreviewTarget(session),
        );
        expect(result.jobs).toHaveLength(1);
        expect(result.jobs[0].input).toMatchObject({
          effects: recipe,
          variantId: "full",
          purpose: "adaptation",
        });
        const assetId = await completeFixturePreview(result.jobs[0].id);
        const saved = await ownedSession("owner-a", session.id);
        for (const copy of [saved.activePlan!, saved.candidates[0]]) {
          expect(copy.recipe).toEqual(recipe);
          expect(copy.previewVariants![0].intensity).toBe(
            (recipe[1].palettes as { colorIntensity: number }[])[0]
              .colorIntensity,
          );
          expect(copy.previewAsset?.id).toBe(assetId);
          expect(copy.previewStatus).toBe("ready");
        }
        expect(state.submit).not.toHaveBeenCalled();
      },
    );

    it("confirms and advances without requiring any measurement or checkpoint request", async () => {
      let session = await seedSession();
      session = await commandFixture(session, {
        type: "approve_candidate",
        candidateId: session.candidates[0].id,
      });
      session = await commandFixture(session, { type: "start" });
      const actions = structuredClone(session.activePlan!.actions);
      session = await commandFixture(session, {
        type: "complete_action",
        actionId: actions[0].id,
      });
      expect(session.stage).toBe("applying");
      expect(currentAction(session)?.id).toBe(actions[1].id);
      expect(session.observations).toEqual([]);
      session = await commandFixture(session, {
        type: "complete_action",
        actionId: actions[1].id,
      });
      const saved = await ownedSession("owner-a", session.id);
      expect(saved.stage).toBe("reviewing");
      expect(saved.completedActionIds).toEqual(
        actions.map((action) => action.id),
      );
      expect(saved.observations).toEqual([]);
      expect(saved.activePlan!.actions).toEqual(actions);
      expect(saved.outcome).toBeUndefined();
      expect(
        saved.events.filter(
          (event) => event.type === "physical_action_user_confirmed",
        ),
      ).toHaveLength(2);
      expect(
        (await state.pool!.query("SELECT count(*) FROM provider_jobs")).rows[0]
          .count,
      ).toBe("0");
    });

    it("revokes only a dropped proposal's unsubmitted job immediately and releases its reservation", async () => {
      const session = await adaptedFixture(true);
      const queued = await queueApplicationFixture(session);
      const jobId = queued.jobs[0].id;
      const history = physicalHistory(queued.session);
      await expect(
        mutateSession("owner-b", session.id, queued.session.revision, {
          type: "decline_adaptation",
        }),
      ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
      const declined = await commandFixture(queued.session, {
        type: "decline_adaptation",
      });
      expect(declined.stage).toBe("paused");
      expect(declined.adaptation).toBeUndefined();
      expect(declined.previewBatch).toBeUndefined();
      expect(physicalHistory(declined)).toBe(history);
      expect(
        (
          await state.pool!.query(
            "SELECT state,cancel_requested,error_code FROM provider_jobs WHERE id=$1",
            [jobId],
          )
        ).rows[0],
      ).toMatchObject({
        state: "cancelled",
        cancel_requested: true,
        error_code: "target_orphaned",
      });
      expect(
        (
          await state.pool!.query(
            "SELECT released FROM quota_reservations WHERE id=$1",
            [jobId],
          )
        ).rows[0].released,
      ).toBe(true);
      await expect(uploadSourceStep(jobId)).resolves.toBe(false);
      expect(state.upload).not.toHaveBeenCalled();
      expect(state.submit).not.toHaveBeenCalled();
    });

    it("keeps a pending target owned when its proposal is accepted, then projects its existing output", async () => {
      const session = await adaptedFixture(true);
      const queued = await queueApplicationFixture(session);
      const jobId = queued.jobs[0].id;
      const history = physicalHistory(queued.session);
      const accepted = await commandFixture(queued.session, {
        type: "accept_adaptation",
        proposalId: queued.session.adaptation!.id,
      });
      expect(accepted.activePlan).toMatchObject({
        previewJobId: jobId,
        previewStatus: "queued",
      });
      expect(
        (
          await state.pool!.query(
            "SELECT state,cancel_requested FROM provider_jobs WHERE id=$1",
            [jobId],
          )
        ).rows[0],
      ).toMatchObject({ state: "queued", cancel_requested: false });
      expect(
        (
          await state.pool!.query(
            "SELECT released FROM quota_reservations WHERE id=$1",
            [jobId],
          )
        ).rows[0].released,
      ).toBe(false);
      const assetId = await completeFixturePreview(jobId);
      const saved = await ownedSession("owner-a", session.id);
      expect(saved.activePlan).toMatchObject({
        previewStatus: "ready",
        previewAsset: { id: assetId },
      });
      expect(saved.candidates[0].previewAsset?.id).toBe(assetId);
      expect(physicalHistory(saved)).toBe(history);
      expect(state.submit).not.toHaveBeenCalled();
    });

    it("resumes a known orphaned task only after a new exact target explicitly reclaims ownership", async () => {
      const session = await adaptedFixture(true);
      const queued = await queueApplicationFixture(session);
      const jobId = queued.jobs[0].id;
      await state.pool!.query(
        "UPDATE provider_jobs SET state='waiting',provider_task_id='fixture-known-task',submission_started_at=now() WHERE id=$1",
        [jobId],
      );
      const identity = (
        await state.pool!.query(
          "SELECT input,request_hash,provider_task_id,source_asset_id FROM provider_jobs WHERE id=$1",
          [jobId],
        )
      ).rows[0];
      let current = await commandFixture(queued.session, {
        type: "decline_adaptation",
      });
      expect(
        (
          await state.pool!.query(
            "SELECT released FROM quota_reservations WHERE id=$1",
            [jobId],
          )
        ).rows[0].released,
      ).toBe(false);
      current = await commandFixture(current, {
        type: "propose_adaptation",
        reason: "movement",
        routeId: "shadow",
      });
      const history = physicalHistory(current);
      vi.stubEnv("YOUCAM_ADAPTATION_DAILY_JOB_LIMIT", "0");
      const resumed = await queueApplicationFixture(current);
      expect(resumed.jobs).toHaveLength(1);
      expect(resumed.jobs[0]).toMatchObject({
        id: jobId,
        state: "waiting",
        provider_task_id: "fixture-known-task",
        cancel_requested: false,
      });
      expect(
        (
          await state.pool!.query(
            "SELECT input,request_hash,provider_task_id,source_asset_id FROM provider_jobs WHERE id=$1",
            [jobId],
          )
        ).rows[0],
      ).toEqual(identity);
      expect(
        (await state.pool!.query("SELECT count(*) FROM quota_reservations"))
          .rows[0].count,
      ).toBe("1");
      const assetId = await completeFixturePreview(jobId);
      const saved = await ownedSession("owner-a", session.id);
      expect(saved.adaptation!.candidate.previewAsset?.id).toBe(assetId);
      expect(physicalHistory(saved)).toBe(history);
      expect(state.submit).not.toHaveBeenCalled();
    });

    it("retains ambiguous orphan spend and can reclaim a late persisted task ID without another submission", async () => {
      const session = await adaptedFixture(true);
      const queued = await queueApplicationFixture(session);
      const jobId = queued.jobs[0].id;
      await state.pool!.query(
        "UPDATE provider_jobs SET state='submitting',submission_started_at=now() WHERE id=$1",
        [jobId],
      );
      let current = await commandFixture(queued.session, {
        type: "decline_adaptation",
      });
      current = await commandFixture(current, {
        type: "propose_adaptation",
        reason: "movement",
        routeId: "shadow",
      });
      const uncertain = await queueApplicationFixture(current);
      expect(uncertain.jobs).toEqual([]);
      expect(uncertain.session.adaptation!.candidate.previewRetryable).toBe(
        false,
      );
      expect(
        (
          await state.pool!.query(
            "SELECT released FROM quota_reservations WHERE id=$1",
            [jobId],
          )
        ).rows[0].released,
      ).toBe(false);
      await state.pool!.query(
        "UPDATE provider_jobs SET provider_task_id='fixture-known-task' WHERE id=$1",
        [jobId],
      );
      await setPreviewStatus(jobId, "processing");
      current = await ownedSession("owner-a", session.id);
      expect(current.adaptation!.candidate.previewRetryable).toBe(true);
      const resumed = await queueApplicationFixture(current);
      expect(resumed.jobs.map((job) => job.id)).toEqual([jobId]);
      expect(resumed.jobs[0].provider_task_id).toBe("fixture-known-task");
      expect(
        (await state.pool!.query("SELECT count(*) FROM provider_jobs")).rows[0]
          .count,
      ).toBe("1");
      expect(
        (await state.pool!.query("SELECT count(*) FROM quota_reservations"))
          .rows[0].count,
      ).toBe("1");
      expect(state.submit).not.toHaveBeenCalled();
    });

    it("does not cancel an exact target still owned by another current candidate after declining a proposal", async () => {
      let session = await seedSession("personal", "owner-a", EYE_SAMPLE_SETUP);
      const shadow = session.candidates.find(
        (candidate) => candidate.routeId === "shadow",
      )!;
      const initial = await queuePreviews(
        "owner-a",
        session.id,
        session.revision,
        "ip-a",
        { candidateId: shadow.id, variantId: "full" },
      );
      session = await commandFixture(initial.session, {
        type: "approve_candidate",
        candidateId: session.candidates[0].id,
      });
      session = await commandFixture(session, { type: "start" });
      session = await commandFixture(session, {
        type: "complete_action",
        actionId: currentAction(session)!.id,
      });
      session = await commandFixture(session, {
        type: "propose_adaptation",
        reason: "movement",
        routeId: "shadow",
      });
      const rebound = await queueApplicationFixture(session);
      expect(rebound.jobs.map((job) => job.id)).toEqual([initial.jobs[0].id]);
      const history = physicalHistory(rebound.session);
      const declined = await commandFixture(rebound.session, {
        type: "decline_adaptation",
      });
      expect(
        (
          await state.pool!.query(
            "SELECT state,cancel_requested FROM provider_jobs WHERE id=$1",
            [initial.jobs[0].id],
          )
        ).rows[0],
      ).toMatchObject({ state: "queued", cancel_requested: false });
      expect(
        (
          await state.pool!.query(
            "SELECT released FROM quota_reservations WHERE id=$1",
            [initial.jobs[0].id],
          )
        ).rows[0].released,
      ).toBe(false);
      expect(physicalHistory(declined)).toBe(history);
      expect(state.submit).not.toHaveBeenCalled();
    });

    it.each(["user_cancelled", "provider_failed"] as const)(
      "does not reclaim a %s task when a later proposal requests its recipe",
      async (ending) => {
        const session = await adaptedFixture(true);
        const queued = await queueApplicationFixture(session);
        const jobId = queued.jobs[0].id;
        await state.pool!.query(
          "UPDATE provider_jobs SET state='waiting',provider_task_id='fixture-known-task',submission_started_at=now() WHERE id=$1",
          [jobId],
        );
        if (ending === "user_cancelled")
          await cancelSessionPreviews("owner-a", session.id);
        else
          await failJob(
            jobId,
            "provider_task_failed",
            "Definitive fixture provider failure.",
          );
        let current = await ownedSession("owner-a", session.id);
        current = await commandFixture(current, { type: "decline_adaptation" });
        current = await commandFixture(current, {
          type: "propose_adaptation",
          reason: "movement",
          routeId: "shadow",
        });
        const result = await queueApplicationFixture(current);
        expect(result.jobs).toEqual([]);
        expect(result.session.adaptation!.candidate.previewRetryable).toBe(
          false,
        );
        expect(
          (
            await state.pool!.query(
              "SELECT error_code FROM provider_jobs WHERE id=$1",
              [jobId],
            )
          ).rows[0].error_code,
        ).not.toBe("target_orphaned");
        expect(
          (await state.pool!.query("SELECT count(*) FROM provider_jobs"))
            .rows[0].count,
        ).toBe("1");
        expect(
          (
            await state.pool!.query(
              "SELECT released FROM quota_reservations WHERE id=$1",
              [jobId],
            )
          ).rows[0].released,
        ).toBe(false);
        expect(state.submit).not.toHaveBeenCalled();
      },
    );

    it("serializes a proposal decline against its pending generation request without leaving unowned spend", async () => {
      const session = await adaptedFixture(true);
      const results = await Promise.allSettled([
        queueApplicationFixture(session),
        commandFixture(session, { type: "decline_adaptation" }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
      const current = await ownedSession("owner-a", session.id);
      if (current.adaptation)
        await commandFixture(current, { type: "decline_adaptation" });
      expect(
        (
          await state.pool!.query(
            "SELECT count(*) FROM provider_jobs WHERE state <> 'cancelled'",
          )
        ).rows[0].count,
      ).toBe("0");
      expect(
        (
          await state.pool!.query(
            "SELECT count(*) FROM quota_reservations WHERE NOT released",
          )
        ).rows[0].count,
      ).toBe("0");
      expect(state.submit).not.toHaveBeenCalled();
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
