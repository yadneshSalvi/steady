import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioAsset, StudioSession } from "../src/lib/contracts";
import { SAMPLE_SETUP } from "../src/lib/catalog";
import { createSession } from "../src/lib/planner";
import { selectPreviewLevel } from "../src/lib/youcam/recipes";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  ownedSession: vi.fn(),
  persistSession: vi.fn(),
}));
vi.mock("../src/lib/server/db", () => ({
  getPool: () => ({ query: mocks.query }),
  transaction: (operation: (client: unknown) => Promise<unknown>) =>
    operation({ query: mocks.query }),
}));
vi.mock("../src/lib/server/sessions", () => ({
  ownedSession: mocks.ownedSession,
  persistSession: mocks.persistSession,
  expectRevision: (session: StudioSession, revision: number) => {
    if (session.revision !== revision) throw new Error("revision_conflict");
  },
}));
vi.mock("../src/lib/server/assets", () => ({
  presentAsset: (row: StudioAsset & { created_at: string }) => ({
    id: row.id,
    url: `/api/assets/${row.id}`,
    provenance: row.provenance,
    purpose: row.purpose,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  }),
}));

import {
  canResumeKnownTask,
  configuredLimit,
  failJob,
  jobMatchesSession,
  previewRequestHash,
  projectJobIntoSession,
  queuePreviews,
  setPreviewStatus,
  type ProviderJob,
} from "../src/lib/server/jobs";

let session: StudioSession;
let job: ProviderJob;
const output: StudioAsset = {
  id: "output-id",
  url: "/api/assets/output-id",
  provenance: "virtual_preview",
  purpose: "preview",
  width: 1024,
  height: 1280,
  createdAt: "2026-10-31T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("YOUCAM_LIVE_ENABLED", "true");
  vi.stubEnv("YOUCAM_DAILY_JOB_LIMIT", "16");
  vi.stubEnv("YOUCAM_SESSION_JOB_LIMIT", "4");
  vi.stubEnv("YOUCAM_IP_DAILY_JOB_LIMIT", "8");
  session = createSession(
    { ...structuredClone(SAMPLE_SETUP), mode: "personal", consent: true },
    "studio-id",
  );
  session.sourceAssetId = "source-id";
  session.candidates = session.candidates.slice(0, 1);
  session.selectedCandidateId = session.candidates[0].id;
  session.candidates[0].previewJobId = "job-id";
  job = {
    id: "job-id",
    session_id: session.id,
    owner_id: "owner",
    candidate_id: session.candidates[0].id,
    source_asset_id: "source-id",
    request_hash: previewRequestHash("source-id", session.candidates[0].recipe),
    input: { effects: structuredClone(session.candidates[0].recipe) },
    state: "waiting",
    provider_task_id: "known-task-id",
    provider_file_id: "file-id",
    workflow_run_id: "workflow-id",
    submission_started_at: new Date(),
    cancel_requested: false,
    output_asset_id: null,
  };
  mocks.ownedSession.mockImplementation(async () => session);
  mocks.persistSession.mockResolvedValue(undefined);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM studio_assets"))
      return {
        rows: [{ ...output, created_at: output.createdAt }],
        rowCount: 1,
      };
    if (sql.includes("FROM provider_jobs")) return { rows: [job], rowCount: 1 };
    if (sql.includes("FROM quota_reservations"))
      return { rows: [{ global: "1", owner: "1", ip: "1" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
});

describe("durable preview projection", () => {
  it.each(["light", undefined] as const)(
    "projects an explicitly bound legacy Full recipe while keeping the historical job level %s immutable",
    (historicalLevel) => {
      const candidate = session.candidates[0];
      const light = candidate.previewVariants!.find(
        (variant) => variant.id === "light",
      )!;
      const full = candidate.previewVariants!.find(
        (variant) => variant.id === "full",
      )!;
      // Older softer plans stored this exact25 recipe without ladder labels;
      // their approved target is now addressed as Full by legacy fallback.
      full.recipe = structuredClone(light.recipe);
      full.intensity = 25;
      full.previewJobId = job.id;
      selectPreviewLevel(candidate, "full");
      session.activePlan = structuredClone(candidate);
      job.input = {
        effects: structuredClone(full.recipe),
        ...(historicalLevel ? { variantId: historicalLevel } : {}),
      };
      job.request_hash = previewRequestHash(job.source_asset_id, full.recipe);
      job.state = "succeeded";
      job.output_asset_id = output.id;
      const input = JSON.stringify(job.input);
      expect(projectJobIntoSession(session, job, output)).toBe(true);
      for (const copy of [candidate, session.activePlan]) {
        expect(copy.selectedPreviewVariantId).toBe("full");
        expect(copy.recipe).toEqual(full.recipe);
        expect(copy.previewStatus).toBe("ready");
        expect(copy.previewAsset?.id).toBe(output.id);
        expect(
          copy.previewVariants!.find((variant) => variant.id === "light")!
            .previewStatus,
        ).toBe("not_requested");
      }
      expect(JSON.stringify(job.input)).toBe(input);
    },
  );

  it("stores an unselected ladder result without replacing the chosen target", () => {
    const candidate = session.candidates[0];
    const full = candidate.previewVariants!.find(
      (variant) => variant.id === "full",
    )!;
    full.previewJobId = job.id;
    const light = candidate.previewVariants!.find(
      (variant) => variant.id === "light",
    )!;
    light.previewStatus = "ready";
    light.previewAsset = { ...output, id: "existing-light-output" };
    selectPreviewLevel(candidate, "light");
    session.activePlan = structuredClone(candidate);
    job.input = { effects: structuredClone(full.recipe), variantId: "full" };
    job.request_hash = previewRequestHash(job.source_asset_id, full.recipe);
    job.state = "succeeded";
    job.output_asset_id = output.id;
    expect(projectJobIntoSession(session, job, output)).toBe(true);
    expect(candidate.previewAsset?.id).toBe("existing-light-output");
    expect(candidate.recipe).toEqual(light.recipe);
    expect(session.activePlan.previewAsset?.id).toBe("existing-light-output");
    expect(full.previewAsset?.id).toBe(output.id);
    expect(session.assets.map((asset) => asset.id)).toEqual([output.id]);
  });

  it("updates the matching selected level in both candidate and approved plan", () => {
    const candidate = session.candidates[0];
    const full = candidate.previewVariants!.find(
      (variant) => variant.id === "full",
    )!;
    full.previewJobId = job.id;
    selectPreviewLevel(candidate, "full");
    session.activePlan = structuredClone(candidate);
    job.input = { effects: structuredClone(full.recipe), variantId: "full" };
    job.state = "succeeded";
    job.output_asset_id = output.id;
    expect(projectJobIntoSession(session, job, output)).toBe(true);
    expect(candidate.previewAsset?.id).toBe(output.id);
    expect(session.activePlan.previewAsset?.id).toBe(output.id);
    expect(
      session.activePlan.previewVariants?.find(
        (variant) => variant.id === "full",
      )?.previewStatus,
    ).toBe("ready");
  });

  it("resumes an interrupted known task without a new reservation or task identity", async () => {
    job.state = "failed";
    job.error_code = "workflow_interrupted";
    const result = await queuePreviews("owner", session.id, 0, "ip-hash", {
      variantId: "full",
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      id: job.id,
      provider_task_id: "known-task-id",
      state: "waiting",
      workflow_run_id: null,
    });
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO quota_reservations"),
      ),
    ).toBe(false);
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO provider_jobs"),
      ),
    ).toBe(false);
  });
  it("does not retry an ambiguous submit, cancelled task, or definitive provider failure", () => {
    expect(
      canResumeKnownTask({
        ...job,
        state: "unknown_submission",
        provider_task_id: null,
      }),
    ).toBe(false);
    expect(
      canResumeKnownTask({
        ...job,
        state: "failed",
        error_code: "polling_timeout",
        cancel_requested: true,
      }),
    ).toBe(false);
    expect(
      canResumeKnownTask({
        ...job,
        state: "failed",
        error_code: "provider_task_failed",
      }),
    ).toBe(false);
    expect(
      canResumeKnownTask({
        ...job,
        state: "failed",
        error_code: "polling_timeout",
      }),
    ).toBe(true);
  });
  it("treats explicit zero and invalid quota configuration as zero", () => {
    vi.stubEnv("TEST_PREVIEW_QUOTA", "0");
    expect(configuredLimit("TEST_PREVIEW_QUOTA", 16)).toBe(0);
    vi.stubEnv("TEST_PREVIEW_QUOTA", "invalid");
    expect(configuredLimit("TEST_PREVIEW_QUOTA", 16)).toBe(0);
    vi.stubEnv("TEST_PREVIEW_QUOTA", "2.9");
    expect(configuredLimit("TEST_PREVIEW_QUOTA", 16)).toBe(2);
  });

  it("matches the exact source and normalized recipe, including JSONB key reordering", () => {
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, item]) => [key, reorder(item)]),
            )
          : value;
    job.input.effects = reorder(
      job.input.effects,
    ) as ProviderJob["input"]["effects"];
    expect(jobMatchesSession(session, job)).toBe(true);
    job.session_id = "another-studio";
    expect(jobMatchesSession(session, job)).toBe(false);
    job.session_id = session.id;
    job.source_asset_id = "another-source";
    expect(jobMatchesSession(session, job)).toBe(false);
    job.source_asset_id = "source-id";
    session.candidates[0].recipe[1].palettes = [
      { color: "#ffffff", texture: "matte", colorIntensity: 60 },
    ];
    expect(jobMatchesSession(session, job)).toBe(false);
  });

  it("cannot attach a stale recipe, wrong asset or late success after cancellation", () => {
    job.state = "succeeded";
    job.output_asset_id = output.id;
    expect(
      projectJobIntoSession(session, job, {
        ...output,
        id: "different-output",
      }),
    ).toBe(false);
    job.cancel_requested = true;
    job.state = "cancelled";
    projectJobIntoSession(session, job, output);
    expect(session.candidates[0]).toMatchObject({ previewStatus: "cancelled" });
    expect(session.candidates[0].previewAsset).toBeUndefined();
    expect(session.assets).toEqual([]);
  });

  it("restores succeeded output after a crash between asset commit and UI projection", async () => {
    job.state = "succeeded";
    job.output_asset_id = output.id;
    await setPreviewStatus(job.id, "ready");
    expect(session.candidates[0]).toMatchObject({
      previewStatus: "ready",
      previewAsset: { id: output.id },
    });
    expect(session.assets.map((asset) => asset.id)).toEqual([output.id]);
    expect(session.revision).toBe(1);
    await setPreviewStatus(job.id, "failed", "Late failure callback");
    expect(session.candidates[0].previewStatus).toBe("ready");
    expect(session.revision).toBe(1);
  });

  it("rebinds an existing success after preferences regenerated candidates without reserving or dispatching again", async () => {
    job.state = "succeeded";
    job.output_asset_id = output.id;
    delete session.candidates[0].previewJobId;
    const result = await queuePreviews("owner", session.id, 0, "ip-hash", {
      variantId: "full",
    });
    expect(result.jobs).toEqual([]);
    expect(result.session.candidates[0]).toMatchObject({
      previewJobId: job.id,
      previewStatus: "ready",
      previewAsset: { id: output.id },
    });
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO provider_jobs"),
      ),
    ).toBe(false);
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO quota_reservations"),
      ),
    ).toBe(false);
  });

  it("preserves a known task when a concurrent uncertainty write loses its database predicate", async () => {
    await failJob(job.id, "unknown_submission", "Ambiguous submission", true);
    const conditional = mocks.query.mock.calls.find(([sql]) =>
      String(sql).startsWith("UPDATE provider_jobs SET state=$2"),
    );
    expect(conditional?.[0]).toContain("provider_task_id IS NULL");
    expect(conditional?.[1]).toEqual([
      job.id,
      "unknown_submission",
      "unknown_submission",
      "Ambiguous submission",
      true,
      false,
    ]);
    expect(session.candidates[0].previewStatus).toBe("processing");
    expect(job.provider_task_id).toBe("known-task-id");
  });
});
