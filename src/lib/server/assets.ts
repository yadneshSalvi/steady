import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { del, get, head, put } from "@vercel/blob";
import sharp from "sharp";
import type { PoolClient } from "pg";
import type { StudioAsset, StudioSession } from "@/lib/contracts";
import { applyCommand } from "@/lib/planner";
import { ApiError } from "./auth";
import { getPool, transaction } from "./db";
import { isUuid, ownedSession, persistSession } from "./sessions";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const storagePrefix = () =>
  `steady/${process.env.VERCEL_ENV || "development"}`;
export const storageConfigured = () =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
export interface AssetRow {
  id: string;
  pathname: string;
  purpose: StudioAsset["purpose"];
  provenance: StudioAsset["provenance"];
  width: number;
  height: number;
  created_at: Date;
  content_type: string;
  bytes: number;
}
export function presentAsset(asset: AssetRow): StudioAsset {
  return {
    id: asset.id,
    url: `/api/assets/${asset.id}`,
    purpose: asset.purpose,
    provenance: asset.provenance,
    width: asset.width,
    height: asset.height,
    createdAt: new Date(asset.created_at).toISOString(),
  };
}
export async function readLimited(
  stream: ReadableStream<Uint8Array>,
  limit = MAX_UPLOAD_BYTES,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new ApiError(
          413,
          "PHOTO_TOO_LARGE",
          "Please choose a photo smaller than 10 MB.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function normalizePhoto(bytes: Buffer, expectedType?: string) {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: 32_000_000 }).metadata();
  } catch {
    throw new ApiError(
      422,
      "PHOTO_UNREADABLE",
      "This photo could not be read. Please use a JPEG, PNG, or WebP image.",
    );
  }
  const types: Record<string, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  if (
    !metadata.format ||
    !types[metadata.format] ||
    (expectedType && types[metadata.format] !== expectedType)
  )
    throw new ApiError(
      422,
      "PHOTO_TYPE_MISMATCH",
      "This file does not match its image type. Please export it as a JPEG or PNG.",
    );
  if ((metadata.width || 0) < 128 || (metadata.height || 0) < 128)
    throw new ApiError(
      422,
      "PHOTO_TOO_SMALL",
      "Choose a clearer photo at least 128 pixels wide and high.",
    );
  const normalized = await sharp(bytes, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 91, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: normalized.data,
    width: normalized.info.width,
    height: normalized.info.height,
  };
}
export function assertUploadStage(
  session: StudioSession,
  purpose: "baseline" | "checkpoint" | "final",
) {
  if (session.mode === "sample")
    throw new ApiError(
      400,
      "SAMPLE_UPLOAD_UNAVAILABLE",
      "The recorded sample keeps its fictional source. Open a personal studio to use your own photos.",
    );
  if (session.stage === "completed" || session.stage === "stopped")
    throw new ApiError(
      409,
      "STUDIO_ENDED",
      "This studio has ended. Its saved photos and physical history cannot be replaced.",
    );
  if (purpose === "baseline" && session.stage !== "choosing")
    throw new ApiError(
      409,
      "BASELINE_LOCKED",
      "Start a new studio to use a different source photo.",
    );
}

/** External objects are tracked through the entire transaction, including
 * COMMIT. Preserve an object if an ambiguous commit actually registered it. */
export async function photoTransaction<T>(
  operation: (
    client: PoolClient,
    track: (pathname: string) => void,
  ) => Promise<T>,
): Promise<T> {
  const paths: string[] = [];
  try {
    return await transaction((client) =>
      operation(client, (pathname) => paths.push(pathname)),
    );
  } catch (error) {
    if (paths.length) {
      try {
        const committed = await getPool().query<{ pathname: string }>(
          "SELECT pathname FROM studio_assets WHERE pathname = ANY($1::text[])",
          [paths],
        );
        const registered = new Set(committed.rows.map((row) => row.pathname));
        const orphaned = paths.filter((path) => !registered.has(path));
        if (orphaned.length) await del(orphaned);
      } catch {
        console.info("[privacy] deferred photo rollback cleanup");
      }
    }
    throw error;
  }
}

export async function createUploadIntent(
  ownerId: string,
  sessionId: string,
  purpose: "baseline" | "checkpoint" | "final",
) {
  if (!storageConfigured())
    throw new ApiError(
      503,
      "PHOTO_STORAGE_UNAVAILABLE",
      "Photo storage is unavailable just now. You can explore the sample studio.",
      true,
    );
  assertUploadStage(await ownedSession(ownerId, sessionId), purpose);
  const count = await getPool().query<{ count: string }>(
    "SELECT count(*) FROM upload_intents WHERE owner_id=$1 AND created_at>now()-interval '1 hour'",
    [ownerId],
  );
  if (Number(count.rows[0].count) >= 40)
    throw new ApiError(
      429,
      "UPLOAD_LIMIT",
      "Please pause photo uploads for a while and try again.",
    );
  const pathname = `${storagePrefix()}/incoming/${sessionId}/${randomUUID()}`;
  await getPool().query(
    "INSERT INTO upload_intents(pathname,owner_id,session_id,purpose) VALUES($1,$2,$3,$4)",
    [pathname, ownerId, sessionId, purpose],
  );
  return { pathname, maxUploadBytes: MAX_UPLOAD_BYTES };
}
export async function authorizeUpload(ownerId: string, pathname: string) {
  const result = await getPool().query<{
    session_id: string;
    purpose: "baseline" | "checkpoint" | "final";
  }>(
    "SELECT session_id,purpose FROM upload_intents WHERE pathname=$1 AND owner_id=$2 AND expires_at>now() AND finalized_asset_id IS NULL",
    [pathname, ownerId],
  );
  if (!result.rows[0])
    throw new ApiError(
      403,
      "UPLOAD_EXPIRED",
      "This upload link expired. Choose your photo again.",
    );
  assertUploadStage(
    await ownedSession(ownerId, result.rows[0].session_id),
    result.rows[0].purpose,
  );
}
export async function finalizeUpload(
  ownerId: string,
  sessionId: string,
  pathname: string,
  purpose: "baseline" | "checkpoint" | "final",
): Promise<StudioAsset> {
  const asset = await photoTransaction(async (client, track) => {
    const session = await ownedSession(ownerId, sessionId, client, true);
    const intent = await client.query<{ finalized_asset_id: string | null }>(
      "SELECT finalized_asset_id FROM upload_intents WHERE pathname=$1 AND owner_id=$2 AND session_id=$3 AND purpose=$4 AND expires_at>now() FOR UPDATE",
      [pathname, ownerId, sessionId, purpose],
    );
    if (!intent.rows[0])
      throw new ApiError(
        403,
        "UPLOAD_EXPIRED",
        "This upload could not be matched to your studio. Please try again.",
      );
    if (intent.rows[0].finalized_asset_id) {
      const previous = await client.query<AssetRow>(
        "SELECT * FROM studio_assets WHERE id=$1",
        [intent.rows[0].finalized_asset_id],
      );
      return presentAsset(previous.rows[0]);
    }
    assertUploadStage(session, purpose);
    const info = await head(pathname);
    if (info.size > MAX_UPLOAD_BYTES)
      throw new ApiError(
        413,
        "PHOTO_TOO_LARGE",
        "Please choose a photo smaller than 10 MB.",
      );
    const object = await get(pathname, { access: "private", useCache: false });
    if (!object || object.statusCode !== 200)
      throw new ApiError(
        404,
        "UPLOAD_NOT_READY",
        "Your photo is still uploading. Please try again.",
        true,
      );
    const photo = await normalizePhoto(
      await readLimited(object.stream),
      info.contentType,
    );
    const asset = await storePhoto(
      client,
      { ownerId, sessionId, purpose, provenance: "actual_capture", ...photo },
      track,
    );
    const next = applyCommand(session, { type: "attach_asset", asset });
    await persistSession(client, next, session.events);
    await client.query(
      "UPDATE upload_intents SET finalized_asset_id=$2 WHERE pathname=$1",
      [pathname, asset.id],
    );
    return asset;
  });
  await del(pathname).catch(() =>
    console.info("[privacy] deferred incoming photo cleanup"),
  );
  return asset;
}
export async function storePhoto(
  client: PoolClient,
  input: {
    ownerId: string;
    sessionId: string;
    purpose: StudioAsset["purpose"];
    provenance: StudioAsset["provenance"];
    bytes: Buffer;
    width: number;
    height: number;
  },
  track?: (pathname: string) => void,
): Promise<StudioAsset> {
  const id = randomUUID();
  const pathname = `${storagePrefix()}/photos/${input.sessionId}/${id}.jpg`;
  track?.(pathname);
  try {
    await put(pathname, input.bytes, {
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
    });
    const result = await client.query<AssetRow>(
      "INSERT INTO studio_assets(id,owner_id,session_id,pathname,purpose,provenance,content_type,bytes,checksum,width,height) VALUES($1,$2,$3,$4,$5,$6,'image/jpeg',$7,$8,$9,$10) RETURNING *",
      [
        id,
        input.ownerId,
        input.sessionId,
        pathname,
        input.purpose,
        input.provenance,
        input.bytes.byteLength,
        createHash("sha256").update(input.bytes).digest("hex"),
        input.width,
        input.height,
      ],
    );
    return presentAsset(result.rows[0]);
  } catch (error) {
    await del(pathname).catch(() => undefined);
    throw error;
  }
}
export async function readAssetBytes(
  ownerId: string,
  assetId: string,
): Promise<Buffer> {
  if (assetId === "sample-portrait-v1")
    return readFile(join(process.cwd(), "public/images/studio-portrait.jpg"));
  if (!isUuid(assetId))
    throw new ApiError(
      404,
      "PHOTO_NOT_FOUND",
      "This photo could not be found.",
    );
  const row = await getPool().query<AssetRow>(
    "SELECT a.* FROM studio_assets a JOIN studio_sessions s ON s.id=a.session_id WHERE a.id=$1 AND a.owner_id=$2 AND a.deleted_at IS NULL AND s.deleted_at IS NULL AND s.expires_at>now() AND a.expires_at>now()",
    [assetId, ownerId],
  );
  if (!row.rows[0])
    throw new ApiError(
      404,
      "PHOTO_NOT_FOUND",
      "This photo could not be found.",
    );
  const object = await get(row.rows[0].pathname, { access: "private" });
  if (!object || object.statusCode !== 200)
    throw new ApiError(
      404,
      "PHOTO_NOT_FOUND",
      "This photo is temporarily unavailable.",
      true,
    );
  return readLimited(object.stream);
}
export async function assetResponse(ownerId: string, assetId: string) {
  if (!isUuid(assetId))
    throw new ApiError(
      404,
      "PHOTO_NOT_FOUND",
      "This photo could not be found.",
    );
  const bytes = await readAssetBytes(ownerId, assetId);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function eraseSessionAssets(sessionId: string) {
  const result = await getPool().query<{ pathname: string }>(
    "SELECT pathname FROM studio_assets WHERE session_id=$1 UNION SELECT pathname FROM upload_intents WHERE session_id=$1",
    [sessionId],
  );
  if (result.rows.length) await del(result.rows.map((row) => row.pathname));
  await getPool().query(
    "DELETE FROM studio_sessions WHERE id=$1 AND deleted_at IS NOT NULL",
    [sessionId],
  );
}
