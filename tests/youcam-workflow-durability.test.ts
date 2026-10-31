import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderJob } from "../src/lib/server/jobs";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getJob: vi.fn(),
  failJob: vi.fn(),
  setPreviewStatus: vi.fn(),
  takeProviderRequest: vi.fn(),
  cancelJob: vi.fn(),
  jobMatchesSession: vi.fn(),
  ownedSession: vi.fn(),
  uploadFile: vi.fn(),
  submitMakeupTask: vi.fn(),
  getMakeupTask: vi.fn(),
  normalizePhoto: vi.fn(),
  readAssetBytes: vi.fn(),
  readLimited: vi.fn(),
  storePhoto: vi.fn(),
  readPreviewBudget: vi.fn(),
}));
vi.mock("../src/lib/server/preview-budget", () => ({
  readPreviewBudget: mocks.readPreviewBudget,
}));
vi.mock("../src/lib/server/db", () => ({
  getPool: () => ({ query: mocks.query }),
  transaction: (operation: (client: unknown) => Promise<unknown>) =>
    operation({ query: mocks.query }),
}));
vi.mock("../src/lib/server/jobs", () => ({
  getJob: mocks.getJob,
  failJob: mocks.failJob,
  setPreviewStatus: mocks.setPreviewStatus,
  takeProviderRequest: mocks.takeProviderRequest,
  cancelJob: mocks.cancelJob,
  jobMatchesSession: mocks.jobMatchesSession,
}));
vi.mock("../src/lib/server/sessions", () => ({
  ownedSession: mocks.ownedSession,
}));
vi.mock("../src/lib/server/assets", () => ({
  normalizePhoto: mocks.normalizePhoto,
  readAssetBytes: mocks.readAssetBytes,
  readLimited: mocks.readLimited,
  storePhoto: mocks.storePhoto,
  photoTransaction: (
    operation: (client: unknown, track: () => void) => Promise<unknown>,
  ) => operation({ query: mocks.query }, () => {}),
}));
vi.mock("../src/lib/youcam", async () => ({
  ...(await vi.importActual("../src/lib/youcam")),
  uploadFile: mocks.uploadFile,
  submitMakeupTask: mocks.submitMakeupTask,
  getMakeupTask: mocks.getMakeupTask,
}));

import {
  pollPreviewStep,
  submitPreviewStep,
} from "../src/workflows/preview-steps";
import { makeRecipe } from "../src/lib/youcam/recipes";

let job: ProviderJob;
const output = {
  id: "stored-output",
  purpose: "preview",
  provenance: "virtual_preview",
  url: "/api/assets/stored-output",
  createdAt: "2026-10-31T00:00:00Z",
  width: 1000,
  height: 1200,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  job = {
    id: "job",
    session_id: "studio",
    owner_id: "owner",
    candidate_id: "candidate",
    source_asset_id: "source",
    request_hash: "hash",
    input: { effects: makeRecipe("rose", "tap", false) },
    state: "waiting",
    provider_task_id: "known-task",
    provider_file_id: "known-file",
    workflow_run_id: "workflow",
    submission_started_at: new Date(),
    cancel_requested: false,
    output_asset_id: null,
  };
  mocks.getJob.mockImplementation(async () => job);
  mocks.ownedSession.mockResolvedValue({ id: job.session_id });
  mocks.jobMatchesSession.mockReturnValue(true);
  mocks.takeProviderRequest.mockResolvedValue(true);
  mocks.readPreviewBudget.mockResolvedValue({ available: true, remaining: 20 });
  mocks.failJob.mockResolvedValue(undefined);
  mocks.cancelJob.mockImplementation(async () => {
    if (job.state !== "succeeded") job.state = "cancelled";
  });
  mocks.setPreviewStatus.mockResolvedValue(undefined);
  mocks.normalizePhoto.mockResolvedValue({
    bytes: Buffer.from([1, 2, 3]),
    width: 1000,
    height: 1200,
  });
  mocks.readLimited.mockResolvedValue(Buffer.from([1, 2, 3]));
  mocks.storePhoto.mockResolvedValue(output);
  mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.startsWith("SELECT")) return { rows: [job], rowCount: 1 };
    if (sql.includes("SET state='submitting'")) {
      job.submission_started_at = new Date();
      job.state = "submitting";
    }
    if (sql.includes("SET provider_task_id=COALESCE")) {
      job.provider_task_id = String(args[1]);
      if (!job.cancel_requested && job.state !== "cancelled")
        job.state = "waiting";
      return { rows: [job], rowCount: 1 };
    }
    if (sql.includes("SET state='ingesting'")) {
      if (job.cancel_requested || job.state === "cancelled")
        return { rows: [], rowCount: 0 };
      job.state = "ingesting";
    }
    if (sql.includes("SET state='succeeded'")) {
      job.state = "succeeded";
      job.output_asset_id = String(args[1]);
    }
    if (sql.includes("SET state='cancelled'")) job.state = "cancelled";
    return { rows: [job], rowCount: 1 };
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))),
  );
});

describe("provider workflow crash and cancellation boundaries", () => {
  it("rechecks the cached floor before writing submission intent or sending a paid POST", async () => {
    job.provider_task_id = null;
    job.submission_started_at = null;
    mocks.readPreviewBudget.mockResolvedValue({
      available: false,
      remaining: 0,
      message: "Fresh previews are resting.",
    });
    await expect(submitPreviewStep(job.id)).resolves.toBe(false);
    expect(job.submission_started_at).toBeNull();
    expect(mocks.submitMakeupTask).not.toHaveBeenCalled();
    expect(mocks.failJob).toHaveBeenCalledWith(
      job.id,
      "live_previews_resting",
      expect.any(String),
      false,
      true,
    );
  });

  it("resumes a known task without another paid POST", async () => {
    await expect(submitPreviewStep(job.id)).resolves.toBe(true);
    expect(mocks.submitMakeupTask).not.toHaveBeenCalled();
  });

  it("does not submit again after an unconfirmed prior submission", async () => {
    job.provider_task_id = null;
    await expect(submitPreviewStep(job.id)).resolves.toBe(false);
    expect(mocks.submitMakeupTask).not.toHaveBeenCalled();
    expect(mocks.failJob).toHaveBeenCalledWith(
      job.id,
      "unknown_submission",
      expect.any(String),
      true,
    );
  });

  it("does not submit an input whose candidate or source was replaced", async () => {
    job.provider_task_id = null;
    job.submission_started_at = null;
    mocks.jobMatchesSession.mockReturnValue(false);
    await expect(submitPreviewStep(job.id)).resolves.toBe(false);
    expect(mocks.cancelJob).toHaveBeenCalledWith(job.id);
    expect(mocks.submitMakeupTask).not.toHaveBeenCalled();
  });

  it("retains the returned task ID without resurrecting a cancellation during POST", async () => {
    job.provider_task_id = null;
    job.submission_started_at = null;
    mocks.submitMakeupTask.mockImplementation(async () => {
      job.cancel_requested = true;
      job.state = "cancelled";
      return { taskId: "returned-after-cancel" };
    });
    await expect(submitPreviewStep(job.id)).resolves.toBe(false);
    expect(job).toMatchObject({
      state: "cancelled",
      provider_task_id: "returned-after-cancel",
    });
    await expect(submitPreviewStep(job.id)).resolves.toBe(false);
    expect(mocks.submitMakeupTask).toHaveBeenCalledTimes(1);
    expect(
      mocks.query.mock.calls.find(([sql]) =>
        String(sql).includes("SET provider_task_id=COALESCE"),
      )?.[0],
    ).toContain("WHEN cancel_requested OR state='cancelled'");
  });

  it("reprojects a committed success without querying or downloading the provider again", async () => {
    job.state = "succeeded";
    job.output_asset_id = output.id;
    await expect(pollPreviewStep(job.id)).resolves.toBe("finished");
    expect(mocks.setPreviewStatus).toHaveBeenCalledWith(job.id, "ready");
    expect(mocks.getMakeupTask).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("finishes cancellation that arrives during private output download without storing an image", async () => {
    mocks.getMakeupTask.mockResolvedValue({
      state: "success",
      outputUrl: "https://bucket.s3.amazonaws.com/preview.png",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async () => {
        job.cancel_requested = true;
        job.state = "cancelled";
        return new Response(new Uint8Array([1, 2, 3]));
      }),
    );
    await expect(pollPreviewStep(job.id)).resolves.toBe("finished");
    expect(job.state).toBe("cancelled");
    expect(mocks.storePhoto).not.toHaveBeenCalled();
  });

  it("repairs a lost UI projection after asset commit on replay, with one stored output", async () => {
    mocks.getMakeupTask.mockResolvedValue({
      state: "success",
      outputUrl: "https://bucket.s3.amazonaws.com/preview.png",
    });
    mocks.setPreviewStatus
      .mockRejectedValueOnce(new Error("Projection unavailable"))
      .mockResolvedValue(undefined);
    await expect(pollPreviewStep(job.id)).rejects.toThrow(
      "Projection unavailable",
    );
    expect(job).toMatchObject({
      state: "succeeded",
      output_asset_id: output.id,
    });
    await expect(pollPreviewStep(job.id)).resolves.toBe("finished");
    expect(mocks.storePhoto).toHaveBeenCalledTimes(1);
    expect(mocks.getMakeupTask).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
