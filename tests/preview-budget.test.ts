import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => ({ query: vi.fn(), credit: vi.fn() }));
vi.mock("../src/lib/youcam", () => ({ getCreditBalance: mocks.credit }));
vi.mock("../src/lib/server/db", () => ({
  transaction: (operation: (client: unknown) => Promise<unknown>) =>
    operation({ query: mocks.query }),
}));
import {
  configuredBalanceFloor,
  freshPreviewAvailability,
  previewUnitsAboveFloor,
  readPreviewBudget,
} from "../src/lib/server/preview-budget";

let cached: { balance: number | null; checked_at: Date } | undefined;
let held: number;
const client = { query: mocks.query } as unknown as PoolClient;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  vi.stubEnv("YOUCAM_LIVE_ENABLED", "true");
  vi.stubEnv("YOUCAM_API_KEY", "test-key");
  vi.stubEnv("YOUCAM_API_BASE_URL", "https://api.example.test");
  vi.stubEnv("YOUCAM_BALANCE_FLOOR", "200");
  cached = undefined;
  held = 0;
  mocks.credit.mockResolvedValue(250);
  mocks.query.mockImplementation(async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith("SELECT balance"))
      return { rows: cached ? [cached] : [] };
    if (sql.startsWith("INSERT INTO provider_credit_balances"))
      cached = {
        balance: args[1] as number | null,
        checked_at: args[2] as Date,
      };
    if (sql.includes("sum(q.units)"))
      return { rows: [{ units: String(held) }] };
    return { rows: [] };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("shared preview budget floor", () => {
  it("leaves the default 200 units untouched and deducts pending reservations", () => {
    expect(configuredBalanceFloor()).toBe(200);
    expect(previewUnitsAboveFloor(199)).toBeLessThan(0);
    expect(previewUnitsAboveFloor(200)).toBe(0);
    expect(previewUnitsAboveFloor(203, 200, 2)).toBe(1);
    expect(previewUnitsAboveFloor(Number.NaN)).toBeLessThan(0);
    vi.stubEnv("YOUCAM_BALANCE_FLOOR", "2000");
    expect(configuredBalanceFloor()).toBe(2000);
    vi.stubEnv("YOUCAM_BALANCE_FLOOR", "invalid");
    expect(configuredBalanceFloor()).toBe(200);
  });

  it("uses the database snapshot for 5 minutes and then verifies again", async () => {
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      available: true,
      remaining: 50,
    });
    held = 2;
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      remaining: 48,
    });
    expect(mocks.credit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300_001);
    mocks.credit.mockResolvedValue(199);
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      available: false,
      reason: "balance_floor",
    });
    expect(mocks.credit).toHaveBeenCalledTimes(2);
  });

  it("fails closed and briefly caches a failed balance read", async () => {
    mocks.credit.mockRejectedValue(new Error("unreadable"));
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      available: false,
      reason: "balance_unavailable",
    });
    await readPreviewBudget(client);
    expect(mocks.credit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_001);
    mocks.credit.mockResolvedValue(250);
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      available: true,
    });
    expect(mocks.credit).toHaveBeenCalledTimes(2);
  });

  it("reports resting at the floor and avoids balance calls when disabled", async () => {
    mocks.credit.mockResolvedValue(200);
    await expect(freshPreviewAvailability()).resolves.toMatchObject({
      available: false,
      reason: "balance_floor",
    });
    vi.stubEnv("YOUCAM_LIVE_ENABLED", "false");
    await expect(freshPreviewAvailability()).resolves.toMatchObject({
      available: false,
      reason: "disabled",
    });
    expect(mocks.credit).toHaveBeenCalledTimes(1);
  });
});
