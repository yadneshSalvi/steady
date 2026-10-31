import "server-only";
import { del, list } from "@vercel/blob";
import { start } from "workflow/api";
import { eraseSessionWorkflow } from "@/workflows/erase-session";
import { getPool } from "./db";
import { storagePrefix } from "./assets";
/** Retention is enforced by deletion, not only by hiding expired database records. */
export async function cleanExpiredData() {
  const pool = getPool();
  await pool.query(
    "UPDATE studio_sessions SET deleted_at=now() WHERE expires_at<now() AND deleted_at IS NULL",
  );
  const sessions = await pool.query<{ id: string }>(
    "SELECT id FROM studio_sessions WHERE deleted_at IS NOT NULL ORDER BY deleted_at LIMIT 50",
  );
  for (const session of sessions.rows)
    await start(eraseSessionWorkflow, [session.id]);
  const abandoned = await pool.query<{ pathname: string }>(
    "SELECT pathname FROM upload_intents WHERE expires_at<now() LIMIT 100",
  );
  if (abandoned.rows.length) {
    await del(abandoned.rows.map((row) => row.pathname));
    await pool.query(
      "DELETE FROM upload_intents WHERE pathname=ANY($1::text[])",
      [abandoned.rows.map((row) => row.pathname)],
    );
  }
  let cursor: string | undefined;
  let orphanCount = 0;
  let pages = 0;
  do {
    const page = await list({
      prefix: `${storagePrefix()}/photos/`,
      limit: 100,
      cursor,
    });
    const old = page.blobs.filter(
      (blob) => Date.now() - blob.uploadedAt.getTime() > 24 * 60 * 60 * 1000,
    );
    if (old.length) {
      const known = await pool.query<{ pathname: string }>(
        "SELECT pathname FROM studio_assets WHERE pathname=ANY($1::text[])",
        [old.map((blob) => blob.pathname)],
      );
      const knownPaths = new Set(known.rows.map((row) => row.pathname));
      const orphaned = old.filter((blob) => !knownPaths.has(blob.pathname));
      if (orphaned.length) {
        await del(orphaned.map((blob) => blob.pathname));
        orphanCount += orphaned.length;
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
    pages++;
  } while (cursor && pages < 10);
  await pool.query(
    "DELETE FROM ai_requests WHERE created_at<now()-interval '7 days'",
  );
  await pool.query(
    "DELETE FROM provider_rate_windows WHERE window_start<now()-interval '1 day'",
  );
  await pool.query("DELETE FROM quota_reservations WHERE day<CURRENT_DATE-35");
  return {
    expiredSessions: sessions.rows.length,
    abandonedUploads: abandoned.rows.length,
    orphanedPhotos: orphanCount,
  };
}
