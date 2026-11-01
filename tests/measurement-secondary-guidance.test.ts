import { describe, expect, it } from "vitest";
import { secondarySpatialGuidance } from "@/lib/vision/measurement-guidance";

function guidance(
  overrides: Partial<Parameters<typeof secondarySpatialGuidance>[0]> = {},
  action?: Parameters<typeof secondarySpatialGuidance>[1],
) {
  return secondarySpatialGuidance(
    {
      region: "left_cheek",
      verdict: "build",
      lagging: "upper",
      regionalProgress: [
        { subregion: "inner", progress: 0.55, pixels: 100 },
        { subregion: "outer", progress: 0.22, pixels: 100 },
      ],
      ...overrides,
    },
    action,
  );
}

describe("secondary spatial cheek guidance", () => {
  it("reports a real horizontal deficit alongside a vertical dominant lag", () => {
    expect(guidance()).toBe("Work gently toward your ear.");
    expect(guidance()).not.toContain("%");
    expect(guidance({}, { motion: "blending" })).toBe(
      "One more broad pass toward your ear.",
    );
    expect(guidance({}, { motion: "tapping" })).toBe(
      "Tap gently toward your ear.",
    );
    expect(
      guidance({
        lagging: "lower",
        regionalProgress: [
          { subregion: "inner", progress: 0.22, pixels: 100 },
          { subregion: "outer", progress: 0.55, pixels: 100 },
        ],
      }),
    ).toBe("Work gently toward the center of the guide.");
  });

  it("requires at least a measured 0.12 horizontal gap", () => {
    expect(
      guidance({
        regionalProgress: [
          { subregion: "inner", progress: 0.5, pixels: 100 },
          { subregion: "outer", progress: 0.381, pixels: 100 },
        ],
      }),
    ).toBeNull();
    expect(
      guidance({
        regionalProgress: [
          { subregion: "inner", progress: 0.5, pixels: 100 },
          { subregion: "outer", progress: 0.38, pixels: 100 },
        ],
      }),
    ).not.toBeNull();
  });

  it("does not add guidance at target, after overshoot/abstention, or repeat horizontal dominance", () => {
    for (const verdict of ["at_target", "over", "insufficient"] as const)
      expect(guidance({ verdict })).toBeNull();
    for (const lagging of ["inner", "outer", null] as const)
      expect(guidance({ lagging })).toBeNull();
    expect(guidance({ region: "left_eye" })).toBeNull();
  });

  it("requires finite supported local measurements and tolerates old mocks", () => {
    expect(guidance({ regionalProgress: undefined })).toBeNull();
    expect(guidance({ regionalProgress: [] })).toBeNull();
    expect(
      guidance({
        regionalProgress: [
          { subregion: "inner", progress: NaN, pixels: 100 },
          { subregion: "outer", progress: 0.2, pixels: 100 },
        ],
      }),
    ).toBeNull();
    expect(
      guidance({
        regionalProgress: [
          { subregion: "inner", progress: 0.7, pixels: 0 },
          { subregion: "outer", progress: 0.2, pixels: 100 },
        ],
      }),
    ).toBeNull();
  });
});
