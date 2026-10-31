import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  getFeatureCosts: vi.fn(),
  uploadFile: vi.fn(),
  submitMakeupTask: vi.fn(),
}));
vi.mock("../src/lib/youcam/index", () => provider);

import { main, parseSmokeArgs } from "../scripts/smoke-youcam";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STEADY_CONFIRM_LIVE_YOUCAM", "");
});

describe("billable smoke-test guard", () => {
  it("defaults to a network-free dry run, even when an API key might exist", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(main([])).resolves.toBe(0);
    expect(provider.getFeatureCosts).not.toHaveBeenCalled();
    expect(provider.uploadFile).not.toHaveBeenCalled();
    expect(provider.submitMakeupTask).not.toHaveBeenCalled();
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      state: "dry_run",
      providerRequests: 0,
    });
  });

  it("requires the exact opt-in flag or exact env value and bounds the look list", () => {
    expect(parseSmokeArgs([], "true").live).toBe(false);
    expect(parseSmokeArgs([], "1").live).toBe(true);
    expect(parseSmokeArgs(["--confirm-live"]).live).toBe(true);
    expect(parseSmokeArgs(["--all-looks"]).looks).toEqual([
      "rose",
      "terracotta",
      "berry",
    ]);
    expect(() => parseSmokeArgs(["--look", "arbitrary"])).toThrow();
    expect(() => parseSmokeArgs(["--max-units", "100"])).toThrow();
  });

  it("halts before upload or submission if current costs exceed its conservative cap", async () => {
    provider.getFeatureCosts.mockResolvedValue({
      nextToken: null,
      skus: [
        {
          amount: 4,
          procUnit: 1,
          unit: "result_image",
          runTaskUrl: "https://api.example.test/s2s/v2.0/task/makeup-vto",
        },
      ],
    });
    await expect(main(["--confirm-live"])).rejects.toThrow("cap");
    expect(provider.uploadFile).not.toHaveBeenCalled();
    expect(provider.submitMakeupTask).not.toHaveBeenCalled();
  });
});
