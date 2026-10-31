import { RetryableError } from "workflow";
import {
  uploadFile,
  submitMakeupTask,
  getMakeupTask,
  YouCamError,
  InvalidRecipeError,
  validateEffects,
} from "@/lib/youcam";
import { getPool, transaction } from "@/lib/server/db";
import {
  getJob,
  failJob,
  failWorkflowRun,
  setPreviewStatus,
  takeProviderRequest,
  cancelJob,
  jobMatchesSession,
  type ProviderJob,
} from "@/lib/server/jobs";
import {
  normalizePhoto,
  readAssetBytes,
  readLimited,
  storePhoto,
  photoTransaction,
} from "@/lib/server/assets";
import { ownedSession } from "@/lib/server/sessions";
import { ApiError } from "@/lib/server/auth";
import { readPreviewBudget } from "@/lib/server/preview-budget";

async function cancelled(job: ProviderJob) {
  if (!job.cancel_requested && job.state !== "cancelled") return false;
  await cancelJob(job.id);
  return true;
}
async function current(job: ProviderJob): Promise<boolean> {
  try {
    return jobMatchesSession(
      await ownedSession(job.owner_id, job.session_id),
      job,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
}
export async function bindPreviewRunStep(
  jobId: string,
  runId: string,
): Promise<boolean> {
  "use step";
  const result = await getPool().query(
    "UPDATE provider_jobs SET workflow_run_id=$2 WHERE id=$1 AND (workflow_run_id IS NULL OR workflow_run_id=$2) AND NOT cancel_requested AND state NOT IN ('succeeded','failed','cancelled','unknown_submission') RETURNING id",
    [jobId, runId],
  );
  return Boolean(result.rowCount);
}
export async function interruptedPreviewStep(jobId: string, runId: string) {
  "use step";
  await failWorkflowRun(jobId, runId);
}
interruptedPreviewStep.maxRetries = 3;

export async function uploadSourceStep(jobId: string): Promise<boolean> {
  "use step";
  console.info("[preview] prepare source", jobId);
  const job = await getJob(jobId);
  if (!job || (await cancelled(job))) return false;
  if (job.state === "succeeded") {
    await setPreviewStatus(jobId, "ready");
    return false;
  }
  if (
    job.state === "failed" ||
    (job.state === "unknown_submission" && !job.provider_task_id)
  ) {
    await setPreviewStatus(jobId, "failed");
    return false;
  }
  if (!(await current(job))) {
    await cancelJob(jobId);
    return false;
  }
  if (job.provider_file_id || job.provider_task_id) return true;
  if (!(await takeProviderRequest()))
    throw new RetryableError("Shared provider request window is busy", {
      retryAfter: "1m",
    });
  const claim = await getPool().query(
    "UPDATE provider_jobs SET state='uploading',updated_at=now() WHERE id=$1 AND NOT cancel_requested AND provider_file_id IS NULL AND provider_task_id IS NULL AND state NOT IN ('succeeded','failed','cancelled','unknown_submission') RETURNING id",
    [jobId],
  );
  if (!claim.rowCount) {
    const latest = await getJob(jobId);
    return Boolean(
      latest &&
      !latest.cancel_requested &&
      latest.state !== "cancelled" &&
      (latest.provider_file_id || latest.provider_task_id),
    );
  }
  await setPreviewStatus(jobId, "processing");
  try {
    const bytes = await readAssetBytes(job.owner_id, job.source_asset_id);
    const latest = await getJob(jobId);
    if (!latest || (await cancelled(latest)) || !(await current(latest))) {
      if (latest) await cancelJob(jobId);
      return false;
    }
    const uploaded = await uploadFile({
      bytes,
      contentType: "image/jpeg",
      fileName: "steady-source.jpg",
    });
    const saved = await getPool().query(
      "UPDATE provider_jobs SET provider_file_id=COALESCE(provider_file_id,$2),state='uploaded',updated_at=now() WHERE id=$1 AND NOT cancel_requested AND provider_task_id IS NULL AND state NOT IN ('succeeded','failed','cancelled','unknown_submission') RETURNING id",
      [jobId, uploaded.fileId],
    );
    if (!saved.rowCount) {
      await setPreviewStatus(jobId, "processing");
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof YouCamError && error.retryable)
      throw new RetryableError(error.message, { retryAfter: "30s" });
    await failJob(
      jobId,
      error instanceof YouCamError ? error.code : "source_unavailable",
      "The source photo could not be prepared. Your choices are saved.",
      false,
      true,
    );
    return false;
  }
}
uploadSourceStep.maxRetries = 2;

export async function submitPreviewStep(jobId: string): Promise<boolean> {
  "use step";
  console.info("[preview] submit reserved job", jobId);
  const initial = await getJob(jobId);
  if (!initial) return false;
  if (!(await takeProviderRequest()))
    throw new RetryableError("Shared provider request window is busy", {
      retryAfter: "1m",
    });
  const prepared = await transaction(async (client) => {
    let session;
    try {
      session = await ownedSession(
        initial.owner_id,
        initial.session_id,
        client,
        true,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        return { kind: "cancelled" as const };
      throw error;
    }
    const row = await client.query<ProviderJob>(
      "SELECT * FROM provider_jobs WHERE id=$1 FOR UPDATE",
      [jobId],
    );
    const job = row.rows[0];
    if (!job || job.cancel_requested || job.state === "cancelled")
      return { kind: "cancelled" as const };
    if (job.state === "succeeded" || job.state === "failed")
      return { kind: "terminal" as const };
    if (
      ["stopped", "completed"].includes(session.stage) &&
      !job.provider_task_id &&
      !job.submission_started_at
    )
      return { kind: "stale" as const };
    if (!jobMatchesSession(session, job)) return { kind: "stale" as const };
    if (job.provider_task_id) {
      if (job.state === "unknown_submission")
        await client.query(
          "UPDATE provider_jobs SET state='waiting',error_code=NULL,error_message=NULL,updated_at=now() WHERE id=$1",
          [jobId],
        );
      return { kind: "submitted" as const };
    }
    if (job.submission_started_at) return { kind: "uncertain" as const };
    if (!job.provider_file_id || job.provider_file_id.length > 2048)
      return { kind: "missing" as const };
    try {
      validateEffects(job.input.effects);
    } catch {
      return { kind: "invalid" as const };
    }
    // A job may have waited through a cache expiry or an operational pause.
    // Recheck before persisting submission intent, and never repeat a paid POST.
    const budget = await readPreviewBudget(client);
    if (!budget.available)
      return { kind: "resting" as const, message: budget.message! };
    await client.query(
      "UPDATE provider_jobs SET state='submitting',submission_started_at=now(),attempts=attempts+1,updated_at=now() WHERE id=$1",
      [jobId],
    );
    return { kind: "ready" as const, job };
  });
  if (prepared.kind === "submitted") return true;
  if (prepared.kind === "cancelled") return false;
  if (prepared.kind === "terminal") {
    await setPreviewStatus(jobId, "processing");
    return false;
  }
  if (prepared.kind === "stale") {
    await cancelJob(jobId);
    return false;
  }
  if (prepared.kind === "uncertain") {
    await failJob(
      jobId,
      "unknown_submission",
      "The provider may have received this request. It will not be submitted again automatically.",
      true,
    );
    return false;
  }
  if (prepared.kind === "missing") {
    await failJob(
      jobId,
      "source_unavailable",
      "The prepared source is unavailable. Your choices are saved.",
      false,
      true,
    );
    return false;
  }
  if (prepared.kind === "invalid" || prepared.kind === "resting") {
    await failJob(
      jobId,
      prepared.kind === "resting" ? "live_previews_resting" : "invalid_recipe",
      prepared.kind === "resting"
        ? prepared.message
        : "This preview recipe could not be prepared. Please choose the method again.",
      false,
      true,
    );
    return false;
  }
  try {
    const submitted = await submitMakeupTask({
      fileId: prepared.job.provider_file_id!,
      effects: prepared.job.input.effects,
    });
    const saved = await getPool().query<ProviderJob>(
      "UPDATE provider_jobs SET provider_task_id=COALESCE(provider_task_id,$2),state=CASE WHEN cancel_requested OR state='cancelled' THEN 'cancelled' WHEN state='succeeded' THEN state WHEN state='failed' AND COALESCE(error_code,'') NOT IN ('dispatch_failed','unknown_submission') THEN state ELSE 'waiting' END,updated_at=now() WHERE id=$1 RETURNING *",
      [jobId, submitted.taskId],
    );
    await setPreviewStatus(jobId, "processing").catch(() =>
      console.info("[preview] deferred submitted task projection"),
    );
    return Boolean(saved.rows[0] && saved.rows[0].state === "waiting");
  } catch (error) {
    const uncertain =
      (!(error instanceof YouCamError) &&
        !(error instanceof InvalidRecipeError)) ||
      (error instanceof YouCamError && error.submissionUncertain);
    const code =
      error instanceof YouCamError || error instanceof InvalidRecipeError
        ? error.code
        : "unknown_submission";
    const message =
      !uncertain && error instanceof Error
        ? error.message
        : "The provider may have received this request. It will not be submitted again automatically.";
    await failJob(jobId, code, message, uncertain);
    return false;
  }
}
// Paid POSTs are never repeated after an ambiguous response or process interruption.
submitPreviewStep.maxRetries = 0;

function allowedOutput(url: string) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    throw new Error("invalid_output_host");
  if (
    ![
      "makeupar.com",
      "perfectcorp.com",
      "amazonaws.com",
      "googleapis.com",
      "blob.core.windows.net",
    ].some((domain) => host === domain || host.endsWith(`.${domain}`))
  )
    throw new Error("invalid_output_host");
  return parsed.href;
}
export async function pollPreviewStep(
  jobId: string,
): Promise<"waiting" | "finished"> {
  "use step";
  const job = await getJob(jobId);
  if (!job || (await cancelled(job))) return "finished";
  // A replay after the asset commit repairs the session projection instead of
  // treating succeeded as an unconditional early return.
  if (job.state === "succeeded") {
    await setPreviewStatus(jobId, "ready");
    return "finished";
  }
  if (
    job.state === "failed" ||
    (job.state === "unknown_submission" && !job.provider_task_id)
  ) {
    await setPreviewStatus(jobId, "failed");
    return "finished";
  }
  if (!(await current(job))) {
    await cancelJob(jobId);
    return "finished";
  }
  if (!job.provider_task_id) {
    await failJob(
      jobId,
      "missing_task",
      "The provider task could not be confirmed. Your work is saved.",
      true,
    );
    return "finished";
  }
  if (!(await takeProviderRequest())) return "waiting";
  let status;
  try {
    status = await getMakeupTask(job.provider_task_id);
  } catch (error) {
    if (error instanceof YouCamError && error.retryable) return "waiting";
    await failJob(
      jobId,
      error instanceof YouCamError ? error.code : "provider_error",
      "This preview could not be retrieved. Your chosen method is still available.",
    );
    return "finished";
  }
  if (status.state === "running") return "waiting";
  if (status.state === "error") {
    await failJob(jobId, status.code, status.message);
    return "finished";
  }
  console.info("[preview] ingest private output", jobId);
  const claim = await getPool().query(
    "UPDATE provider_jobs j SET state='ingesting',updated_at=now() FROM studio_sessions s WHERE j.id=$1 AND s.id=j.session_id AND s.deleted_at IS NULL AND s.expires_at>now() AND NOT j.cancel_requested AND j.state NOT IN ('succeeded','failed','cancelled') AND j.provider_task_id=$2 RETURNING j.id",
    [jobId, job.provider_task_id],
  );
  if (!claim.rowCount) {
    await setPreviewStatus(jobId, "processing");
    return "finished";
  }
  let response: Response;
  try {
    response = await fetch(allowedOutput(status.outputUrl), {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new RetryableError("Preview download unavailable", {
      retryAfter: "10s",
    });
  }
  if (!response.ok || !response.body)
    throw new RetryableError("Preview download unavailable", {
      retryAfter: "10s",
    });
  const photo = await normalizePhoto(await readLimited(response.body));
  let asset;
  try {
    asset = await photoTransaction(async (client, track) => {
      const session = await ownedSession(
        job.owner_id,
        job.session_id,
        client,
        true,
      );
      const latest = await client.query<ProviderJob>(
        "SELECT * FROM provider_jobs WHERE id=$1 FOR UPDATE",
        [jobId],
      );
      const fresh = latest.rows[0];
      if (!fresh) return null;
      if (fresh.output_asset_id || fresh.state === "succeeded") return null;
      if (
        fresh.cancel_requested ||
        fresh.state === "cancelled" ||
        !jobMatchesSession(session, fresh)
      ) {
        await client.query(
          "UPDATE provider_jobs SET state='cancelled',cancel_requested=true,updated_at=now() WHERE id=$1 AND state NOT IN ('succeeded','failed')",
          [jobId],
        );
        return null;
      }
      if (fresh.state === "failed") return null;
      const stored = await storePhoto(
        client,
        {
          ownerId: job.owner_id,
          sessionId: job.session_id,
          purpose: "preview",
          provenance: "virtual_preview",
          ...photo,
        },
        track,
      );
      await client.query(
        "UPDATE provider_jobs SET state='succeeded',output_asset_id=$2,updated_at=now() WHERE id=$1",
        [jobId, stored.id],
      );
      return stored;
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return "finished";
    throw error;
  }
  if (asset) await setPreviewStatus(jobId, "ready", undefined, asset);
  else await setPreviewStatus(jobId, "processing");
  return "finished";
}
pollPreviewStep.maxRetries = 3;
export async function timeoutPreviewStep(jobId: string, runId: string) {
  "use step";
  console.info("[preview] polling deadline", jobId);
  await failWorkflowRun(jobId, runId, "polling_timeout");
}
