import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  SetupInput,
  StudioSession,
  SessionCommand,
  StudioAsset,
  SessionEvent,
} from "@/lib/contracts";
import { applyCommand, createSession } from "@/lib/planner";
import { getPool, transaction } from "./db";
import { ApiError } from "./auth";
import { attachRecordedSamplePreviews } from "./recorded-previews";
import { reconcilePreviewOwnership } from "./jobs";

export const isUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );

export async function ownedSession(
  ownerId: string,
  sessionId: string,
  client?: PoolClient,
  lock = false,
): Promise<StudioSession> {
  if (!isUuid(sessionId))
    throw new ApiError(
      404,
      "SESSION_NOT_FOUND",
      "This studio could not be found.",
    );
  const db = client ?? getPool();
  const result = await db.query<{ data: StudioSession }>(
    `SELECT data FROM studio_sessions WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL AND expires_at > now() ${lock ? "FOR UPDATE" : ""}`,
    [sessionId, ownerId],
  );
  if (!result.rows[0])
    throw new ApiError(
      404,
      "SESSION_NOT_FOUND",
      "This studio could not be found. Open your studio on the browser where you created it.",
    );
  return result.rows[0].data;
}

export async function persistSession(
  client: PoolClient,
  session: StudioSession,
  priorEvents: readonly SessionEvent[] = [],
) {
  await attachRecordedSamplePreviews(session);
  await client.query(
    "UPDATE studio_sessions SET revision = $2, data = $3::jsonb, updated_at = now() WHERE id = $1",
    [session.id, session.revision, JSON.stringify(session)],
  );
  const existingIds = new Set(priorEvents.map((event) => event.id));
  for (const event of session.events) {
    if (!existingIds.has(event.id))
      await client.query(
        "INSERT INTO studio_events(id,session_id,revision,event) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING",
        [event.id, session.id, session.revision, JSON.stringify(event)],
      );
  }
}

export async function newSession(
  ownerId: string,
  setup: SetupInput,
): Promise<StudioSession> {
  if (setup.mode === "sample" && setup.includeLips)
    throw new ApiError(
      400,
      "SAMPLE_LIPS_UNAVAILABLE",
      "Recorded samples cover cheeks or eyes. Use a personal studio for optional lip color.",
    );
  // A source capture is always attached after creation with a validated ownership check.
  if (setup.sourceAssetId)
    throw new ApiError(
      400,
      "CAPTURE_ATTACH_REQUIRED",
      "Add your photo after opening the studio.",
    );
  return transaction(async (client) => {
    const count = await client.query<{ count: string }>(
      "SELECT count(*) FROM studio_sessions WHERE owner_id = $1 AND created_at > now() - interval '1 day'",
      [ownerId],
    );
    if (Number(count.rows[0].count) >= 30)
      throw new ApiError(
        429,
        "STUDIO_LIMIT",
        "You have opened many studios today. Continue an existing studio or return tomorrow.",
      );
    const session = createSession(setup, randomUUID());
    session.events.push({
      id: randomUUID(),
      type: "consent_recorded",
      at: session.createdAt,
      detail:
        "studio-privacy-v1: private session storage; selected YouCam preview processing only when requested",
      provenance: "user_confirmed",
    });
    if (setup.mode === "sample" && !session.sourceAssetId) {
      const asset: StudioAsset = {
        id: "sample-portrait-v1",
        url: "/images/studio-portrait.jpg",
        provenance: "synthetic_inspiration",
        purpose: "baseline",
        createdAt: session.createdAt,
        width: 1024,
        height: 1280,
      };
      session.assets.push(asset);
      session.sourceAssetId = asset.id;
    }
    await client.query(
      "INSERT INTO studio_sessions(id,owner_id,revision,data) VALUES($1,$2,$3,$4::jsonb)",
      [session.id, ownerId, session.revision, JSON.stringify(session)],
    );
    await persistSession(client, session);
    return session;
  });
}

export function expectRevision(session: StudioSession, expected: number) {
  if (session.revision !== expected)
    throw new ApiError(
      409,
      "REVISION_CONFLICT",
      "Your studio changed in another window. The latest saved state has been loaded; please try your choice again.",
      true,
    );
}

export async function mutateSession(
  ownerId: string,
  sessionId: string,
  expectedRevision: number,
  command: SessionCommand,
): Promise<StudioSession> {
  return transaction(async (client) => {
    const current = await ownedSession(ownerId, sessionId, client, true);
    expectRevision(current, expectedRevision);
    // Never accept a browser-created asset or a private object path through an event.
    if (command.type === "attach_asset")
      throw new ApiError(
        400,
        "ASSET_REQUIRES_UPLOAD",
        "Please use the photo upload control.",
      );
    if (
      (command.type === "checkpoint" && command.assetId) ||
      (command.type === "finish" && command.finalAssetId)
    ) {
      const assetId =
        command.type === "checkpoint" ? command.assetId : command.finalAssetId;
      const result = await client.query(
        "SELECT id FROM studio_assets WHERE id = $1 AND owner_id = $2 AND session_id = $3 AND provenance = 'actual_capture' AND deleted_at IS NULL",
        [assetId, ownerId, sessionId],
      );
      if (!result.rowCount)
        throw new ApiError(
          422,
          "CAPTURE_NOT_FOUND",
          "Choose one of your actual photos for this step.",
        );
    }
    const next = applyCommand(current, command);
    if (
      [
        "update_setup",
        "set_preferences",
        "approve_candidate",
        "propose_adaptation",
        "accept_adaptation",
        "decline_adaptation",
        "stop",
      ].includes(command.type)
    )
      await reconcilePreviewOwnership(client, ownerId, next);
    await persistSession(client, next, current.events);
    return next;
  });
}

export async function listSessions(ownerId: string): Promise<StudioSession[]> {
  const result = await getPool().query<{ data: StudioSession }>(
    "SELECT data FROM studio_sessions WHERE owner_id = $1 AND deleted_at IS NULL AND expires_at > now() ORDER BY updated_at DESC LIMIT 30",
    [ownerId],
  );
  return result.rows.map((row) => row.data);
}

export async function markSessionDeleted(ownerId: string, sessionId: string) {
  return transaction(async (client) => {
    await ownedSession(ownerId, sessionId, client, true);
    await client.query(
      "UPDATE studio_sessions SET deleted_at = now() WHERE id = $1",
      [sessionId],
    );
    await client.query(
      "UPDATE provider_jobs SET state = 'cancelled', updated_at = now() WHERE session_id = $1 AND state NOT IN ('succeeded','failed','unknown_submission')",
      [sessionId],
    );
    await client.query(
      "UPDATE quota_reservations q SET released=true FROM provider_jobs j WHERE q.id=j.id AND j.session_id=$1 AND j.provider_task_id IS NULL AND j.submission_started_at IS NULL",
      [sessionId],
    );
  });
}
