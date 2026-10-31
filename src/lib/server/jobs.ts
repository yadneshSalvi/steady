import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { MakeupEffect, StudioSession, StudioAsset } from "@/lib/contracts";
import { validateEffects } from "@/lib/youcam/recipes";
import { ApiError } from "./auth";
import { getPool, transaction } from "./db";
import { ownedSession, expectRevision, persistSession } from "./sessions";
import { presentAsset, type AssetRow } from "./assets";
import type { PoolClient } from "pg";

export interface ProviderJob {
  id: string;
  session_id: string;
  owner_id: string;
  candidate_id: string;
  source_asset_id: string;
  request_hash: string;
  input: { effects: MakeupEffect[] };
  state: string;
  provider_task_id: string | null;
  provider_file_id: string | null;
  workflow_run_id: string | null;
  submission_started_at: Date | null;
  cancel_requested: boolean;
  output_asset_id: string | null;
  error_code?: string | null;
  error_message?: string | null;
}
export function canResumeKnownTask(job: ProviderJob): boolean {
  return Boolean(
    job.provider_task_id &&
    !job.cancel_requested &&
    (job.state === "unknown_submission" ||
      (job.state === "failed" &&
        ["polling_timeout", "workflow_interrupted"].includes(
          job.error_code || "",
        ))),
  );
}
export function configuredLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(1000, Math.floor(parsed)))
    : 0;
}
export function previewRequestHash(
  source: string,
  effects: MakeupEffect[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({ source, effects: validateEffects(effects) }))
    .digest("hex");
}
export function jobMatchesSession(
  session: StudioSession,
  job: ProviderJob,
): boolean {
  const candidate = session.candidates.find(
    (item) => item.id === job.candidate_id && item.previewJobId === job.id,
  );
  if (!candidate || session.sourceAssetId !== job.source_asset_id) return false;
  try {
    return (
      previewRequestHash(job.source_asset_id, candidate.recipe) ===
        job.request_hash &&
      previewRequestHash(job.source_asset_id, job.input.effects) ===
        job.request_hash
    );
  } catch {
    return false;
  }
}

/** Project authoritative durable state; a late callback cannot regress a
 * cancelled task, attach another recipe, or mutate the approved recipe. */
export function projectJobIntoSession(
  session: StudioSession,
  job: ProviderJob,
  asset?: StudioAsset,
): boolean {
  if (!jobMatchesSession(session, job)) return false;
  const candidate = session.candidates.find(
    (item) => item.id === job.candidate_id,
  )!;
  const before = JSON.stringify({
    candidate,
    activePlan: session.activePlan,
    assets: session.assets,
  });
  if (job.cancel_requested || job.state === "cancelled") {
    candidate.previewStatus = "cancelled";
    candidate.previewError =
      "Preview cancelled in STEADY. An already submitted provider task may still use a credit.";
    delete candidate.previewAsset;
  } else if (job.state === "succeeded") {
    if (
      !asset ||
      asset.id !== job.output_asset_id ||
      asset.provenance !== "virtual_preview" ||
      asset.purpose !== "preview"
    )
      return false;
    candidate.previewStatus = "ready";
    candidate.previewAsset = asset;
    delete candidate.previewError;
    if (!session.assets.some((item) => item.id === asset.id))
      session.assets.push(asset);
  } else if (
    job.state === "failed" ||
    (job.state === "unknown_submission" && !job.provider_task_id)
  ) {
    candidate.previewStatus = "failed";
    candidate.previewError =
      job.error_message ||
      "The preview could not be completed. Your chosen method is preserved.";
    delete candidate.previewAsset;
  } else {
    candidate.previewStatus = job.state === "queued" ? "queued" : "processing";
    delete candidate.previewError;
    delete candidate.previewAsset;
  }
  if (session.activePlan?.id === candidate.id) {
    try {
      if (
        previewRequestHash(job.source_asset_id, session.activePlan.recipe) ===
        job.request_hash
      ) {
        session.activePlan = {
          ...session.activePlan,
          previewStatus: candidate.previewStatus,
          previewAsset: candidate.previewAsset,
          previewError: candidate.previewError,
          previewJobId: job.id,
        };
      }
    } catch {
      /* An invalid or newer target is left untouched. */
    }
  }
  return (
    before !==
    JSON.stringify({
      candidate,
      activePlan: session.activePlan,
      assets: session.assets,
    })
  );
}
async function outputAsset(
  client: PoolClient,
  job: ProviderJob,
): Promise<StudioAsset | undefined> {
  if (!job.output_asset_id) return undefined;
  const row = await client.query<AssetRow>(
    "SELECT * FROM studio_assets WHERE id=$1 AND owner_id=$2 AND session_id=$3 AND provenance='virtual_preview' AND purpose='preview' AND deleted_at IS NULL AND expires_at>now()",
    [job.output_asset_id, job.owner_id, job.session_id],
  );
  return row.rows[0] ? presentAsset(row.rows[0]) : undefined;
}
export function requesterHash(request: Request) {
  const raw = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for") || "unknown"
    : "local-development";
  return createHash("sha256")
    .update(`${process.env.BETTER_AUTH_SECRET}:${raw.split(",")[0].trim()}`)
    .digest("hex");
}

export async function queuePreviews(
  ownerId: string,
  sessionId: string,
  expectedRevision: number,
  ipHash: string,
) {
  if (process.env.YOUCAM_LIVE_ENABLED !== "true")
    throw new ApiError(
      503,
      "LIVE_PREVIEWS_PAUSED",
      "Fresh previews are paused. You can still choose a method and explore the studio.",
      true,
    );
  return transaction(async (client) => {
    const session = await ownedSession(ownerId, sessionId, client, true);
    expectRevision(session, expectedRevision);
    if (!session.sourceAssetId)
      throw new ApiError(
        422,
        "PHOTO_REQUIRED",
        "Add your source photo before creating personal previews.",
      );
    if (!session.candidates.length)
      throw new ApiError(
        422,
        "NO_PLAN",
        "Confirm comfortable movements and tools before creating previews.",
      );
    if (!["choosing", "ready"].includes(session.stage))
      throw new ApiError(
        409,
        "PREVIEW_STAGE",
        "Create previews before starting application.",
      );
    await client.query("SELECT pg_advisory_xact_lock(7134239)");
    const counts = await client.query<{
      global: string;
      owner: string;
      ip: string;
    }>(
      "SELECT count(*) FILTER (WHERE day=CURRENT_DATE) AS global, count(*) FILTER (WHERE owner_id=$1) AS owner, count(*) FILTER (WHERE ip_hash=$2 AND day=CURRENT_DATE) AS ip FROM quota_reservations WHERE NOT released",
      [ownerId, ipHash],
    );
    const usage = counts.rows[0];
    const jobs: ProviderJob[] = [];
    let newReservations = 0;
    let changed = false;
    for (const candidate of session.candidates) {
      const effects = validateEffects(candidate.recipe);
      const hash = previewRequestHash(session.sourceAssetId, effects);
      const previous = await client.query<ProviderJob>(
        "SELECT * FROM provider_jobs WHERE session_id=$1 AND candidate_id=$2 AND request_hash=$3 FOR UPDATE",
        [session.id, candidate.id, hash],
      );
      if (previous.rows[0]) {
        const prior = previous.rows[0];
        if (canResumeKnownTask(prior)) {
          await client.query(
            "UPDATE provider_jobs SET state='waiting',error_code=NULL,error_message=NULL,workflow_run_id=NULL,updated_at=now() WHERE id=$1 AND provider_task_id IS NOT NULL",
            [prior.id],
          );
          prior.state = "waiting";
          prior.error_code = null;
          prior.error_message = null;
          prior.workflow_run_id = null;
          jobs.push(prior);
        } else if (
          prior.state === "queued" &&
          !prior.workflow_run_id &&
          !prior.cancel_requested
        )
          jobs.push(prior);
        changed ||= candidate.previewJobId !== prior.id;
        candidate.previewJobId = prior.id;
        changed =
          projectJobIntoSession(
            session,
            prior,
            await outputAsset(client, prior),
          ) || changed;
        continue;
      }
      const pending = newReservations + 1;
      if (
        Number(usage.global) + pending >
          configuredLimit("YOUCAM_DAILY_JOB_LIMIT", 16) ||
        Number(usage.owner) + pending >
          configuredLimit("YOUCAM_SESSION_JOB_LIMIT", 4) ||
        Number(usage.ip) + pending >
          configuredLimit("YOUCAM_IP_DAILY_JOB_LIMIT", 8)
      )
        throw new ApiError(
          429,
          "PREVIEW_ALLOWANCE",
          "This studio's preview allowance has been used for now. Your methods and saved work remain available.",
        );
      const jobId = randomUUID();
      const result = await client.query<ProviderJob>(
        "INSERT INTO provider_jobs(id,session_id,owner_id,candidate_id,source_asset_id,request_hash,input,state) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'queued') RETURNING *",
        [
          jobId,
          session.id,
          ownerId,
          candidate.id,
          session.sourceAssetId,
          hash,
          JSON.stringify({ effects }),
        ],
      );
      await client.query(
        "INSERT INTO quota_reservations(id,owner_id,ip_hash) VALUES($1,$2,$3)",
        [jobId, ownerId, ipHash],
      );
      newReservations++;
      candidate.previewStatus = "queued";
      candidate.previewJobId = jobId;
      delete candidate.previewError;
      delete candidate.previewAsset;
      jobs.push(result.rows[0]);
      changed = true;
    }
    if (changed) {
      session.revision++;
      session.updatedAt = new Date().toISOString();
      await persistSession(client, session, session.events);
    }
    return { session, jobs };
  });
}
export async function getJob(id: string): Promise<ProviderJob | null> {
  const result = await getPool().query<ProviderJob>(
    "SELECT j.* FROM provider_jobs j JOIN studio_sessions s ON s.id=j.session_id WHERE j.id=$1 AND s.deleted_at IS NULL AND s.expires_at>now()",
    [id],
  );
  return result.rows[0] || null;
}
export async function setPreviewStatus(
  jobId: string,
  _status: "processing" | "ready" | "failed" | "cancelled",
  message?: string,
  asset?: StudioAsset,
) {
  return transaction(async (client) => {
    const result = await client.query<ProviderJob>(
      "SELECT * FROM provider_jobs WHERE id=$1",
      [jobId],
    );
    const job = result.rows[0];
    if (!job) return;
    let session: StudioSession;
    try {
      session = await ownedSession(job.owner_id, job.session_id, client, true);
    } catch {
      return;
    }
    // Session -> job is the shared lock order used by cancellation and ingest.
    const latest = await client.query<ProviderJob>(
      "SELECT * FROM provider_jobs WHERE id=$1 FOR UPDATE",
      [jobId],
    );
    const current = latest.rows[0];
    if (!current) return;
    const restored =
      asset?.id === current.output_asset_id
        ? asset
        : await outputAsset(client, current);
    if (message && !current.error_message && current.state === "failed")
      current.error_message = message;
    if (!projectJobIntoSession(session, current, restored)) return;
    session.revision++;
    session.updatedAt = new Date().toISOString();
    await persistSession(client, session, session.events);
  });
}
export async function failJob(
  jobId: string,
  code: string,
  message: string,
  uncertain = false,
  release = false,
) {
  // A second workflow may observe the first while its POST is in flight. It
  // cannot overwrite a task ID that was persisted before this update arrived.
  await getPool().query(
    "UPDATE provider_jobs SET state=$2,error_code=$3,error_message=$4,updated_at=now() WHERE id=$1 AND state NOT IN ('succeeded','cancelled') AND (NOT $5::boolean OR provider_task_id IS NULL) AND (NOT $6::boolean OR (provider_task_id IS NULL AND submission_started_at IS NULL))",
    [
      jobId,
      uncertain ? "unknown_submission" : "failed",
      code,
      message,
      uncertain,
      release,
    ],
  );
  if (release)
    await getPool().query(
      "UPDATE quota_reservations SET released=true WHERE id=$1 AND EXISTS(SELECT 1 FROM provider_jobs WHERE id=$1 AND provider_task_id IS NULL AND submission_started_at IS NULL)",
      [jobId],
    );
  await setPreviewStatus(jobId, "failed", message);
}
export async function takeProviderRequest(): Promise<boolean> {
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(7134240)");
    // 80 requests per five minutes leaves a conservative shared-account allocation for STAGECRAFT.
    const result = await client.query<{ requests: number }>(
      "INSERT INTO provider_rate_windows(window_start,requests) VALUES(date_trunc('minute',now())-((extract(minute from now())::int%5)*interval '1 minute'),1) ON CONFLICT(window_start) DO UPDATE SET requests=provider_rate_windows.requests+1 RETURNING requests",
    );
    return result.rows[0].requests <= 80;
  });
}

/** An exhausted old run cannot fail a newer recovery run. */
export async function failWorkflowRun(
  jobId: string,
  runId: string,
  reason: "workflow_interrupted" | "polling_timeout" = "workflow_interrupted",
) {
  await getPool().query(
    "UPDATE provider_jobs SET state=CASE WHEN provider_task_id IS NULL AND submission_started_at IS NOT NULL THEN 'unknown_submission' ELSE 'failed' END,error_code=CASE WHEN provider_task_id IS NULL AND submission_started_at IS NOT NULL THEN 'unknown_submission' ELSE $3 END,error_message=CASE WHEN provider_task_id IS NULL AND submission_started_at IS NOT NULL THEN 'The provider may have received this request. It will not be submitted again automatically.' WHEN provider_task_id IS NOT NULL THEN 'This preview paused before its result was saved. Request previews again to check the existing task without another paid submission.' ELSE 'The preview stopped before submission. Your choices are saved.' END,updated_at=now() WHERE id=$1 AND workflow_run_id=$2 AND state NOT IN ('succeeded','failed','cancelled','unknown_submission')",
    [jobId, runId, reason],
  );
  await getPool().query(
    "UPDATE quota_reservations SET released=true WHERE id=$1 AND EXISTS(SELECT 1 FROM provider_jobs WHERE id=$1 AND workflow_run_id=$2 AND state='failed' AND provider_task_id IS NULL AND submission_started_at IS NULL)",
    [jobId, runId],
  );
  await setPreviewStatus(jobId, "failed");
}
export async function cancelSessionPreviews(
  ownerId: string,
  sessionId: string,
) {
  return transaction(async (client) => {
    const session = await ownedSession(ownerId, sessionId, client, true);
    const rows = await client.query<ProviderJob>(
      "UPDATE provider_jobs SET cancel_requested=true,state='cancelled',updated_at=now() WHERE session_id=$1 AND state NOT IN ('succeeded','failed','cancelled','unknown_submission') RETURNING *",
      [sessionId],
    );
    if (rows.rows.length) {
      await client.query(
        "UPDATE quota_reservations SET released=true WHERE id=ANY($1::uuid[]) AND EXISTS(SELECT 1 FROM provider_jobs j WHERE j.id=quota_reservations.id AND j.provider_task_id IS NULL AND j.submission_started_at IS NULL)",
        [rows.rows.map((job) => job.id)],
      );
      let changed = false;
      for (const job of rows.rows)
        changed = projectJobIntoSession(session, job) || changed;
      if (changed) {
        session.revision++;
        session.updatedAt = new Date().toISOString();
        await persistSession(client, session, session.events);
      }
    }
    return session;
  });
}

export async function cancelJob(jobId: string): Promise<void> {
  await getPool().query(
    "UPDATE provider_jobs SET cancel_requested=true,state='cancelled',updated_at=now() WHERE id=$1 AND (state NOT IN ('succeeded','failed','unknown_submission') OR (state='unknown_submission' AND provider_task_id IS NOT NULL))",
    [jobId],
  );
  await getPool().query(
    "UPDATE quota_reservations SET released=true WHERE id=$1 AND EXISTS(SELECT 1 FROM provider_jobs WHERE id=$1 AND state='cancelled' AND provider_task_id IS NULL AND submission_started_at IS NULL)",
    [jobId],
  );
  await setPreviewStatus(jobId, "cancelled");
}
