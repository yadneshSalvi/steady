import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getCreditBalance } from "@/lib/youcam";
import { transaction } from "./db";

const CACHE_MS = 5 * 60 * 1000;
const FAILURE_CACHE_MS = 30 * 1000;
const RESTING_MESSAGE =
  "Fresh previews are resting; recorded results and your saved methods still work.";

export interface PreviewBudget {
  available: boolean;
  remaining: number;
  reason?: "disabled" | "balance_floor" | "balance_unavailable";
  message?: string;
}

export function configuredBalanceFloor(): number {
  const raw = process.env.YOUCAM_BALANCE_FLOOR;
  if (raw === undefined || raw.trim() === "") return 200;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0
    ? Math.min(value, 1_000_000_000)
    : 200;
}

/** Pure floor policy, also used for a cached snapshot at the submission boundary. */
export function previewUnitsAboveFloor(
  balance: number,
  floor = configuredBalanceFloor(),
  reservedUnits = 0,
): number {
  if (!Number.isFinite(balance) || balance < 0) return -1;
  return Math.floor(balance - floor - Math.max(0, reservedUnits));
}

function disabled(): PreviewBudget | undefined {
  if (
    process.env.YOUCAM_LIVE_ENABLED !== "true" ||
    !process.env.YOUCAM_API_KEY ||
    !process.env.YOUCAM_API_BASE_URL
  )
    return {
      available: false,
      remaining: 0,
      reason: "disabled",
      message:
        "Fresh previews are paused. Recorded results and your saved methods still work.",
    };
}

export async function readPreviewBudget(
  client: PoolClient,
): Promise<PreviewBudget> {
  const paused = disabled();
  if (paused) return paused;
  const key = createHash("sha256")
    .update(`${process.env.YOUCAM_API_BASE_URL}\0${process.env.YOUCAM_API_KEY}`)
    .digest("hex");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `youcam-credit:${key}`,
  ]);
  const cached = await client.query<{
    balance: number | null;
    checked_at: Date;
  }>(
    "SELECT balance,checked_at FROM provider_credit_balances WHERE account_key=$1",
    [key],
  );
  let snapshot = cached.rows[0];
  const ttl = snapshot?.balance == null ? FAILURE_CACHE_MS : CACHE_MS;
  if (
    !snapshot ||
    Date.now() - new Date(snapshot.checked_at).getTime() >= ttl
  ) {
    // Timestamp before the read so every reservation created afterwards is
    // deducted even when another instance is waiting on this cache refresh.
    const checkedAt = new Date();
    let balance: number | null;
    try {
      balance = await getCreditBalance({ timeoutMs: 5_000 });
    } catch {
      balance = null;
    }
    await client.query(
      "INSERT INTO provider_credit_balances(account_key,balance,checked_at) VALUES($1,$2,$3) ON CONFLICT(account_key) DO UPDATE SET balance=EXCLUDED.balance,checked_at=EXCLUDED.checked_at",
      [key, balance, checkedAt],
    );
    snapshot = { balance, checked_at: checkedAt };
  }
  if (snapshot.balance == null)
    return {
      available: false,
      remaining: 0,
      reason: "balance_unavailable",
      message: RESTING_MESSAGE,
    };
  const held = await client.query<{ units: string }>(
    "SELECT COALESCE(sum(q.units),0) AS units FROM quota_reservations q JOIN provider_jobs j ON j.id=q.id WHERE NOT q.released AND (q.created_at>=$1 OR j.submission_started_at>=$1 OR (j.provider_task_id IS NULL AND j.state<>'failed'))",
    [snapshot.checked_at],
  );
  const remaining = previewUnitsAboveFloor(
    snapshot.balance,
    configuredBalanceFloor(),
    Number(held.rows[0]?.units || 0),
  );
  return remaining < 0
    ? {
        available: false,
        remaining: 0,
        reason: "balance_floor",
        message: RESTING_MESSAGE,
      }
    : { available: true, remaining };
}

/** No account totals or credential-derived cache keys reach the browser. */
export async function freshPreviewAvailability(): Promise<PreviewBudget> {
  const paused = disabled();
  if (paused) return paused;
  try {
    const budget = await transaction(readPreviewBudget);
    return budget.remaining === 0 && budget.available
      ? {
          available: false,
          remaining: 0,
          reason: "balance_floor",
          message: RESTING_MESSAGE,
        }
      : budget;
  } catch {
    return {
      available: false,
      remaining: 0,
      reason: "balance_unavailable",
      message: RESTING_MESSAGE,
    };
  }
}
