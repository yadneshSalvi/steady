import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type {
  CandidatePlan,
  MakeupEffect,
  PreviewLevel,
  PreviewVariant,
  StudioSession,
  StudioAsset,
} from "@/lib/contracts";
import {
  makePreviewVariants,
  selectPreviewLevel,
  validateEffects,
} from "@/lib/youcam/recipes";
import { ApiError } from "./auth";
import { getPool, transaction } from "./db";
import { ownedSession, expectRevision, persistSession } from "./sessions";
import { presentAsset, type AssetRow } from "./assets";
import type { PoolClient } from "pg";
import { readPreviewBudget, type PreviewBudget } from "./preview-budget";
import { applicationPreviewTarget } from "@/lib/planner/state";

export { requesterHash } from "./auth";

export interface ProviderJob {
  id: string;
  session_id: string;
  owner_id: string;
  candidate_id: string;
  source_asset_id: string;
  request_hash: string;
  input: {
    effects: MakeupEffect[];
    variantId?: PreviewLevel;
    purpose?: "preview" | "adaptation";
  };
  state: string;
  provider_task_id: string | null;
  provider_file_id: string | null;
  workflow_run_id: string | null;
  submission_started_at: Date | null;
  cancel_requested: boolean;
  output_asset_id: string | null;
  error_code?: string | null;
  error_message?: string | null;
  superseded_at?: Date | null;
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
  return (
    !job.superseded_at &&
    session.id === job.session_id &&
    session.sourceAssetId === job.source_asset_id &&
    candidateCopies(session).some(
      (candidate) => jobTargets(candidate, job).length > 0,
    )
  );
}

function candidateCopies(session: StudioSession, id?: string): CandidatePlan[] {
  return [
    ...new Set([
      ...session.candidates,
      ...(session.adaptation ? [session.adaptation.candidate] : []),
      ...(session.activePlan ? [session.activePlan] : []),
    ]),
  ].filter((candidate) => !id || candidate.id === id);
}

function recipeMatchesJob(
  target: CandidatePlan | PreviewVariant,
  job: ProviderJob,
): boolean {
  try {
    return (
      previewRequestHash(job.source_asset_id, target.recipe) ===
        job.request_hash &&
      previewRequestHash(job.source_asset_id, job.input.effects) ===
        job.request_hash
    );
  } catch {
    return false;
  }
}

function jobTargets(
  candidate: CandidatePlan,
  job: ProviderJob,
): (CandidatePlan | PreviewVariant)[] {
  const variants = candidate.previewVariants ?? [];
  if (!variants.length)
    return candidate.previewJobId === job.id && recipeMatchesJob(candidate, job)
      ? [candidate]
      : [];
  // A level is presentation, not paid request identity. Legacy softer recipes
  // can match a job submitted under a different level or before levels existed.
  const targets = variants.filter(
    (variant) =>
      variant.previewJobId === job.id && recipeMatchesJob(variant, job),
  );
  const selected = variants.find(
    (variant) => variant.id === (candidate.selectedPreviewVariantId ?? "full"),
  );
  // Older saves bound only the top-level target. Repair that projection only
  // when the selected recipe is exact and has no newer job of its own.
  if (
    selected &&
    !selected.previewJobId &&
    candidate.previewJobId === job.id &&
    recipeMatchesJob(candidate, job) &&
    recipeMatchesJob(selected, job)
  )
    targets.push(selected);
  return targets;
}

/** Project authoritative durable state; a late callback cannot regress a
 * cancelled task, attach another recipe, or mutate the approved recipe. */
export function projectJobIntoSession(
  session: StudioSession,
  job: ProviderJob,
  asset?: StudioAsset,
): boolean {
  if (!jobMatchesSession(session, job)) return false;
  const snapshot = () =>
    JSON.stringify({
      candidates: session.candidates,
      activePlan: session.activePlan,
      adaptation: session.adaptation,
      assets: session.assets,
    });
  const before = snapshot();
  if (
    job.state === "succeeded" &&
    (!asset ||
      asset.id !== job.output_asset_id ||
      asset.provenance !== "virtual_preview" ||
      asset.purpose !== "preview")
  )
    return false;
  for (const candidate of candidateCopies(session)) {
    const targets = jobTargets(candidate, job);
    for (const target of targets) {
      target.previewJobId = job.id;
      if (job.cancel_requested || job.state === "cancelled") {
        target.previewStatus = "cancelled";
        target.previewError = "Preview stopped. Your chosen method is saved.";
        target.previewRetryable =
          !job.provider_task_id && !job.submission_started_at;
        delete target.previewAsset;
      } else if (job.state === "succeeded") {
        target.previewStatus = "ready";
        target.previewAsset = asset!;
        delete target.previewRetryable;
        delete target.previewError;
        if (!session.assets.some((item) => item.id === asset!.id))
          session.assets.push(asset!);
      } else if (
        job.state === "failed" ||
        (job.state === "unknown_submission" && !job.provider_task_id)
      ) {
        target.previewStatus = "failed";
        target.previewRetryable =
          canResumeKnownTask(job) ||
          (job.state === "failed" &&
            !job.provider_task_id &&
            !job.submission_started_at);
        target.previewError =
          job.state === "failed" &&
          !canResumeKnownTask(job) &&
          Boolean(job.provider_task_id || job.submission_started_at)
            ? "This preview could not be created. Try a new photo; your chosen method is saved."
            : job.error_message ||
              "The preview stopped before submission. Please try again.";
        delete target.previewAsset;
      } else {
        target.previewStatus = job.state === "queued" ? "queued" : "processing";
        delete target.previewRetryable;
        delete target.previewError;
        delete target.previewAsset;
      }
    }
    const selected = candidate.previewVariants?.find(
      (variant) =>
        variant.id === (candidate.selectedPreviewVariantId ?? "full"),
    );
    if (selected && targets.includes(selected))
      selectPreviewLevel(candidate, selected.id);
  }
  return before !== snapshot();
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
export interface PreviewRequestOptions {
  candidateId?: string;
  variantId?: PreviewLevel;
}

function legacyPreviewVariant(candidate: CandidatePlan): PreviewVariant {
  const id = candidate.selectedPreviewVariantId ?? "full";
  const appearance = candidate.recipe.find((effect) =>
    ["blush", "eye_liner", "eye_shadow"].includes(effect.category),
  );
  const palette = Array.isArray(appearance?.palettes)
    ? appearance.palettes[0]
    : undefined;
  const amount =
    palette && typeof palette === "object" && !Array.isArray(palette)
      ? palette.colorIntensity
      : undefined;
  const intensity =
    ([20, 25, 45, 65] as const).find((value) => value === amount) ??
    ({ light: 25, build: 45, full: 65 } as const)[id];
  return {
    id,
    intensity,
    recipe: structuredClone(candidate.recipe),
    previewStatus: candidate.previewStatus,
    previewAsset: candidate.previewAsset,
    previewJobId: candidate.previewJobId,
    previewError: candidate.previewError,
    previewRetryable: candidate.previewRetryable,
  };
}

export async function queuePreviews(
  ownerId: string,
  sessionId: string,
  expectedRevision: number,
  ipHash: string,
  options: PreviewRequestOptions = {},
) {
  const result = await transaction(async (client) => {
    const session = await ownedSession(ownerId, sessionId, client, true);
    expectRevision(session, expectedRevision);
    if (session.mode === "sample")
      throw new ApiError(
        403,
        "SAMPLE_PREVIEWS_RECORDED",
        "The sample uses saved YouCam previews. Start a personal studio to create fresh previews.",
      );
    if (["completed", "stopped"].includes(session.stage))
      throw new ApiError(
        409,
        "STUDIO_ENDED",
        "This studio has finished. Its saved methods and previews are still available.",
      );
    if (session.stage === "reviewing")
      throw new ApiError(
        409,
        "PREVIEW_STAGE",
        "Review your saved result before starting another studio for a fresh preview.",
      );
    if (!session.sourceAssetId)
      throw new ApiError(
        422,
        "PHOTO_REQUIRED",
        "Add your source photo before creating personal previews.",
      );
    if (!session.candidates.length && !session.adaptation?.candidate)
      throw new ApiError(
        422,
        "NO_PLAN",
        "Confirm comfortable movements and tools before creating previews.",
      );
    const adapting = !["choosing", "ready"].includes(session.stage);
    const applicationTarget = applicationPreviewTarget(session);
    if (
      adapting &&
      (!applicationTarget ||
        (options.candidateId &&
          options.candidateId !== applicationTarget.candidateId) ||
        (options.variantId &&
          options.variantId !== applicationTarget.variantId))
    )
      throw new ApiError(
        409,
        "PREVIEW_STAGE",
        "During application, create the selected target for the current method.",
      );
    const candidateId =
      options.candidateId ||
      applicationTarget?.candidateId ||
      session.selectedCandidateId;
    // The proposal/approved plan is authoritative during application, including
    // older saves whose comparison card still has a different selected level.
    const candidate = adapting
      ? session.stage === "adapting"
        ? session.adaptation?.candidate
        : session.activePlan
      : candidateId
        ? candidateCopies(session, candidateId)[0]
        : undefined;
    if (!candidate)
      throw new ApiError(
        422,
        "PREVIEW_METHOD_REQUIRED",
        "Choose a method before creating its personal previews.",
      );
    if (!candidate.previewVariants?.length) {
      // Legacy approved recipes stay exact. Rebuilding one from today's
      // catalog could silently change an already accepted appearance.
      const variants: PreviewVariant[] = adapting
        ? [legacyPreviewVariant(candidate)]
        : makePreviewVariants(
            session.lookId,
            candidate.routeId,
            session.includeLips,
          );
      for (const copy of candidateCopies(session, candidate.id))
        copy.previewVariants = structuredClone(variants);
    }
    const selectedLevel = candidate.selectedPreviewVariantId || "full";
    const requestedLevel = adapting
      ? applicationTarget!.variantId
      : options.variantId;
    const targets = candidate
      .previewVariants!.filter(
        (variant) => !requestedLevel || variant.id === requestedLevel,
      )
      .sort(
        (a, b) =>
          Number(b.id === selectedLevel) - Number(a.id === selectedLevel),
      );
    if (!targets.length)
      throw new ApiError(
        422,
        "PREVIEW_LEVEL_REQUIRED",
        "Choose an available preview level.",
      );
    await client.query("SELECT pg_advisory_xact_lock(7134239)");
    await client.query(
      "UPDATE quota_reservations q SET released=true FROM provider_jobs j WHERE q.id=j.id AND NOT q.released AND j.state IN ('failed','cancelled') AND j.provider_task_id IS NULL AND j.submission_started_at IS NULL",
    );
    const counts = await client.query<{
      global: string;
      owner: string;
      ip: string;
      adaptation: string;
    }>(
      "SELECT count(*) AS global,count(*) FILTER (WHERE q.owner_id=$1) AS owner,count(*) FILTER (WHERE q.ip_hash=$2) AS ip,count(*) FILTER (WHERE q.owner_id=$1 AND j.input->>'purpose'='adaptation') AS adaptation FROM quota_reservations q LEFT JOIN provider_jobs j ON j.id=q.id WHERE NOT q.released AND q.day=CURRENT_DATE",
      [ownerId, ipHash],
    );
    const usage = counts.rows[0];
    const jobs: ProviderJob[] = [];
    let newReservations = 0;
    let deferred = 0;
    let hasPending = false;
    let changed = false;
    let budget: PreviewBudget | undefined;
    let blockedMessage: string | undefined;
    const remainingQuota = () =>
      Math.max(
        0,
        Math.min(
          configuredLimit("YOUCAM_DAILY_JOB_LIMIT", 12) -
            Number(usage.global) -
            newReservations,
          configuredLimit("YOUCAM_SESSION_JOB_LIMIT", 6) -
            Number(usage.owner) -
            newReservations,
          configuredLimit("YOUCAM_IP_DAILY_JOB_LIMIT", 8) -
            Number(usage.ip) -
            newReservations,
          adapting
            ? Math.min(
                2,
                configuredLimit("YOUCAM_ADAPTATION_DAILY_JOB_LIMIT", 2),
              ) -
                Number(usage.adaptation || 0) -
                newReservations
            : Infinity,
          budget ? budget.remaining - newReservations : Infinity,
        ),
      );
    const bind = (variant: PreviewVariant, job: ProviderJob) => {
      for (const copy of candidateCopies(session, candidate.id)) {
        if (!copy.previewVariants?.length)
          copy.previewVariants = structuredClone(candidate.previewVariants);
        const target = copy.previewVariants?.find(
          (entry) => entry.id === variant.id,
        );
        if (
          target &&
          previewRequestHash(session.sourceAssetId!, target.recipe) ===
            job.request_hash
        ) {
          changed ||= target.previewJobId !== job.id;
          target.previewJobId = job.id;
          if (adapting && copy.selectedPreviewVariantId !== selectedLevel) {
            selectPreviewLevel(copy, selectedLevel);
            changed = true;
          }
        }
      }
    };
    for (const variant of targets) {
      const effects = validateEffects(variant.recipe);
      const hash = previewRequestHash(session.sourceAssetId, effects);
      const previous = await client.query<ProviderJob>(
        // Explicitly rebind an exact source/recipe job after repair instead of
        // paying again merely because the physical action candidate has a new ID.
        // A paid/uncertain attempt takes precedence over an unsubmitted failure.
        "SELECT * FROM provider_jobs WHERE session_id=$1 AND source_asset_id=$2 AND request_hash=$3 AND superseded_at IS NULL ORDER BY CASE WHEN state='succeeded' THEN 0 WHEN provider_task_id IS NOT NULL THEN 1 WHEN submission_started_at IS NOT NULL THEN 2 WHEN state NOT IN ('failed','cancelled') THEN 3 ELSE 4 END,created_at DESC LIMIT 1 FOR UPDATE",
        [session.id, session.sourceAssetId, hash],
      );
      const prior = previous.rows[0];
      const retryUnsubmitted =
        prior &&
        ["failed", "cancelled"].includes(prior.state) &&
        !prior.provider_task_id &&
        !prior.submission_started_at;
      if (prior && !retryUnsubmitted) {
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
        hasPending ||= ![
          "succeeded",
          "failed",
          "cancelled",
          "unknown_submission",
        ].includes(prior.state);
        bind(variant, prior);
        changed =
          projectJobIntoSession(
            session,
            prior,
            await outputAsset(client, prior),
          ) || changed;
        continue;
      }
      if (!budget) budget = await readPreviewBudget(client);
      if (!budget.available || remainingQuota() < 1) {
        deferred++;
        blockedMessage =
          !budget.available || budget.remaining - newReservations < 1
            ? budget.message ||
              "Fresh previews are resting; recorded results and your saved methods still work."
            : "The remaining preview levels can be requested after the daily allowance resets. Your methods and saved work are still available.";
        continue;
      }
      if (retryUnsubmitted)
        await client.query(
          "UPDATE provider_jobs SET superseded_at=now(),updated_at=now() WHERE id=$1 AND state IN ('failed','cancelled') AND provider_task_id IS NULL AND submission_started_at IS NULL",
          [prior.id],
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
          JSON.stringify({
            effects,
            variantId: variant.id,
            purpose: adapting ? "adaptation" : "preview",
          }),
        ],
      );
      await client.query(
        "INSERT INTO quota_reservations(id,owner_id,ip_hash,created_at) VALUES($1,$2,$3,clock_timestamp())",
        [jobId, ownerId, ipHash],
      );
      newReservations++;
      const created = result.rows[0];
      bind(variant, created);
      projectJobIntoSession(session, created);
      jobs.push(created);
      changed = true;
    }
    if (deferred && !jobs.length && !hasPending) {
      const resting = budget && (!budget.available || budget.remaining < 1);
      // Commit the shared balance snapshot and released reservations even when
      // no new work fits. Rejected requests must not force a fresh balance GET.
      return new ApiError(
        resting ? 503 : 429,
        budget?.reason === "disabled"
          ? "LIVE_PREVIEWS_PAUSED"
          : resting
            ? "LIVE_PREVIEWS_RESTING"
            : "PREVIEW_ALLOWANCE",
        blockedMessage!,
        true,
      );
    }
    const batch = {
      requested: targets.length,
      queued: jobs.length,
      deferred,
      remaining: remainingQuota(),
      ...(blockedMessage
        ? {
            message: `${jobs.length ? `${jobs.length} preview level${jobs.length === 1 ? " is" : "s are"} queued. ` : ""}${blockedMessage}`,
          }
        : {}),
    };
    changed ||= JSON.stringify(session.previewBatch) !== JSON.stringify(batch);
    session.previewBatch = batch;
    if (changed) {
      session.revision++;
      session.updatedAt = new Date().toISOString();
      await persistSession(client, session, session.events);
    }
    return { session, jobs, batch };
  });
  if (result instanceof ApiError) throw result;
  return result;
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
  await transaction(async (client) => {
    await client.query(
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
    await client.query(
      "UPDATE quota_reservations SET released=true WHERE id=$1 AND EXISTS(SELECT 1 FROM provider_jobs WHERE id=$1 AND state IN ('failed','cancelled') AND provider_task_id IS NULL AND submission_started_at IS NULL)",
      [jobId],
    );
  });
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
  await transaction(async (client) => {
    await client.query(
      "UPDATE provider_jobs SET state=CASE WHEN provider_task_id IS NULL AND submission_started_at IS NOT NULL THEN 'unknown_submission' ELSE 'failed' END,error_code=CASE WHEN provider_task_id IS NULL AND submission_started_at IS NOT NULL THEN 'unknown_submission' ELSE $3 END,error_message=CASE WHEN provider_task_id IS NULL AND submission_started_at IS NOT NULL THEN 'The provider may have received this request. It will not be submitted again automatically.' WHEN provider_task_id IS NOT NULL THEN 'This preview paused before its result was saved. Request previews again to check the existing task without another paid submission.' ELSE 'The preview stopped before submission. Your choices are saved.' END,updated_at=now() WHERE id=$1 AND workflow_run_id=$2 AND state NOT IN ('succeeded','failed','cancelled','unknown_submission')",
      [jobId, runId, reason],
    );
    await client.query(
      "UPDATE quota_reservations SET released=true WHERE id=$1 AND EXISTS(SELECT 1 FROM provider_jobs WHERE id=$1 AND workflow_run_id=$2 AND state='failed' AND provider_task_id IS NULL AND submission_started_at IS NULL)",
      [jobId, runId],
    );
  });
  await setPreviewStatus(jobId, "failed");
}
export async function cancelSessionPreviews(
  ownerId: string,
  sessionId: string,
) {
  return transaction(async (client) => {
    const session = await ownedSession(ownerId, sessionId, client, true);
    const rows = await client.query<ProviderJob>(
      "UPDATE provider_jobs SET cancel_requested=true,state='cancelled',updated_at=now() WHERE session_id=$1 AND (state NOT IN ('succeeded','failed','cancelled','unknown_submission') OR (state='unknown_submission' AND provider_task_id IS NOT NULL)) RETURNING *",
      [sessionId],
    );
    if (rows.rows.length) {
      await client.query(
        "UPDATE quota_reservations SET released=true WHERE id=ANY($1::uuid[]) AND EXISTS(SELECT 1 FROM provider_jobs j WHERE j.id=quota_reservations.id AND j.provider_task_id IS NULL AND j.submission_started_at IS NULL)",
        [rows.rows.map((job) => job.id)],
      );
      let changed = Boolean(session.previewBatch);
      delete session.previewBatch;
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
  await transaction(async (client) => {
    await client.query(
      "UPDATE provider_jobs SET cancel_requested=true,state='cancelled',updated_at=now() WHERE id=$1 AND (state NOT IN ('succeeded','failed','unknown_submission') OR (state='unknown_submission' AND provider_task_id IS NOT NULL))",
      [jobId],
    );
    await client.query(
      "UPDATE quota_reservations SET released=true WHERE id=$1 AND EXISTS(SELECT 1 FROM provider_jobs WHERE id=$1 AND state='cancelled' AND provider_task_id IS NULL AND submission_started_at IS NULL)",
      [jobId],
    );
  });
  await setPreviewStatus(jobId, "cancelled");
}
