import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/lib/server/db", () => ({
  getPool: () => ({ query: mocks.query }),
  transaction: (operation: (client: unknown) => Promise<unknown>) =>
    operation({ query: mocks.query }),
}));
import { reserveAIRequest } from "../src/lib/server/ai-input";
import { assertSameOrigin } from "../src/lib/server/auth";

let counts: { global: string; owner: string; ip: string };
const request = () =>
  new Request("https://steady.example/api/inspiration", {
    method: "POST",
    headers: { Origin: "https://steady.example" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "https://steady.example");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-salt");
  counts = { global: "0", owner: "0", ip: "0" };
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("count(*)") ? [counts] : [],
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("AI and voice spending boundaries", () => {
  it("requires an Origin header for state-changing AI requests", () => {
    expect(() =>
      assertSameOrigin(new Request("https://steady.example/api/inspiration"), {
        requireOrigin: true,
      }),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://steady.example/api/inspiration", {
          headers: { Origin: "https://unrelated.example" },
        }),
        { requireOrigin: true },
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(request(), { requireOrigin: true }),
    ).not.toThrow();
  });

  it.each([
    ["global", "AI", "inspiration"],
    ["owner", "AI", "inspiration"],
    ["ip", "AI", "inspiration"],
    ["global", "VOICE", "voice_command"],
    ["owner", "VOICE", "voice_command"],
    ["ip", "VOICE", "voice_command"],
  ])(
    "enforces a configurable %s %s cap before inserting a reservation",
    async (scope, prefix, purpose) => {
      vi.stubEnv(
        `${prefix}_${scope === "global" ? "" : `${scope.toUpperCase()}_`}HOURLY_REQUEST_LIMIT`,
        "2",
      );
      counts[scope as keyof typeof counts] = "2";
      await expect(
        reserveAIRequest("owner", purpose, request()),
      ).rejects.toMatchObject({ code: "AI_REQUEST_LIMIT" });
      expect(
        mocks.query.mock.calls.some(([sql]) =>
          String(sql).startsWith("INSERT"),
        ),
      ).toBe(false);
    },
  );

  it("serializes the app-wide voice bucket and records only an IP digest", async () => {
    await reserveAIRequest("owner", "voice_command", request());
    expect(mocks.query.mock.calls[0][1]).toEqual(["ai:voice"]);
    const insert = mocks.query.mock.calls.find(([sql]) =>
      String(sql).startsWith("INSERT"),
    );
    expect(insert?.[1]).toEqual([
      expect.any(String),
      "owner",
      "voice_command:deepgram-consent-v1",
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
    expect(
      mocks.query.mock.calls.find(([sql]) =>
        String(sql).includes("count(*)"),
      )?.[1]?.[2],
    ).toBe(true);
  });
});
