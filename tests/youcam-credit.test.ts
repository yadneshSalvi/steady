import { describe, expect, it, vi } from "vitest";
import { getCreditBalance } from "../src/lib/youcam";

describe("read-only YouCam balance", () => {
  it("sums usable official credit pools and ignores expired pools", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: 200,
        results: [
          { amount: 988, expiry: Date.now() + 86_400_000 },
          { amount: 40 },
          { amount: 900, expiry: Date.now() - 1 },
        ],
      }),
    );
    await expect(
      getCreditBalance({
        fetch: fetcher,
        apiKey: "test-key",
        baseUrl: "https://api.example.test",
      }),
    ).resolves.toBe(1028);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.test/s2s/v1.0/client/credit",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("rejects unrecognized balances instead of authorizing work", async () => {
    for (const results of [[{ amount: -1 }], [{ amount: "200" }], [{}]]) {
      await expect(
        getCreditBalance({
          fetch: vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json({ status: 200, results })),
          apiKey: "test-key",
          baseUrl: "https://api.example.test",
        }),
      ).rejects.toMatchObject({ code: "invalid_response" });
    }
  });
});
