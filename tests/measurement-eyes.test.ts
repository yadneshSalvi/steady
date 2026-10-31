import { describe, expect, it } from "vitest";
import type { EyeRegion } from "@/lib/contracts";
import {
  EYE_LANDMARKS,
  REGION_LANDMARKS,
  type Point,
} from "@/lib/vision/geometry";
import {
  createMeasurementTarget,
  measureCheckpoint,
  regionExclusions,
  regionPolygon,
  type MeasurementFrame,
} from "@/lib/vision/measure";
import recordedLandmarks from "./fixtures/sample-landmarks.json";

const WIDTH = 640,
  HEIGHT = 800;
const SKIN = [0.4, 0.24, 0.16];
const DARKEN = [-0.13, -0.08, -0.05];
function encode(value: number) {
  return Math.round(
    255 *
      (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055),
  );
}
function contains(x: number, y: number, polygon: readonly Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function frame(
  region: EyeRegion,
  intensity: number | ((x: number) => number),
  ocular = [0.05, 0.06, 0.08],
  points: Point[] = structuredClone(recordedLandmarks.points),
): MeasurementFrame {
  const polygon = regionPolygon(recordedLandmarks.points, region);
  const xs = polygon.map((point) => point.x),
    ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const eye = EYE_LANDMARKS[region].map(
    (index) => recordedLandmarks.points[index],
  );
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      const nx = (x + 0.5) / WIDTH,
        ny = (y + 0.5) / HEIGHT;
      const amount =
        nx > minX && nx < maxX && ny > minY && ny < maxY
          ? typeof intensity === "function"
            ? intensity(nx)
            : intensity
          : 0;
      const color = contains(nx, ny, eye)
        ? ocular
        : SKIN.map((value, channel) => value + DARKEN[channel] * amount);
      const offset = (y * WIDTH + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        data[offset + channel] = encode(color[channel]);
      data[offset + 3] = 255;
    }
  return { image: { width: WIDTH, height: HEIGHT, data }, landmarks: points };
}

describe("experimental upper-lid color measurement", () => {
  it.each(["left_eye", "right_eye"] as const)(
    "recovers known upper-lid changes for %s while excluding the eye surface",
    (region) => {
      const baseline = frame(region, 0);
      const full = frame(region, 1);
      const target = createMeasurementTarget(baseline, full, region);
      expect(target.valid, target.reason).toBe(true);
      for (const intensity of [0, 0.5, 1]) {
        const result = measureCheckpoint({
          baseline,
          checkpoint: frame(region, intensity),
          target,
        });
        expect(result.verdict, result.reason).toBe(
          intensity === 1 ? "at_target" : "build",
        );
        expect(Math.abs(result.progress! - intensity)).toBeLessThan(0.06);
        expect(result.diagnostics.validPixels).toBeGreaterThanOrEqual(96);
        expect(result.heatmap.length).toBeGreaterThan(0);
        expect(result.exclusions).toHaveLength(1);
      }
      const alteredEye = measureCheckpoint({
        baseline,
        checkpoint: frame(region, 1, [0.7, 0.1, 0.2]),
        target,
      });
      expect(alteredEye.verdict, alteredEye.reason).toBe("at_target");
      expect(alteredEye.progress).toBeCloseTo(1, 5);
    },
  );

  it.each(["left_eye", "right_eye"] as const)(
    "finds the lagging outer part of %s",
    (region) => {
      const baseline = frame(region, 0);
      const target = createMeasurementTarget(
        baseline,
        frame(region, 1),
        region,
      );
      const polygon = regionPolygon(recordedLandmarks.points, region);
      const xs = polygon.map((point) => point.x);
      const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
      const result = measureCheckpoint({
        baseline,
        checkpoint: frame(region, (x) =>
          x < middle === (region === "left_eye") ? 0.8 : 0.2,
        ),
        target,
      });
      expect(result.verdict, result.reason).toBe("build");
      expect(result.lagging).toBe("outer");
      expect(result.uniformity).toBeLessThan(0.8);
    },
  );

  it("abstains when eye openness differs from the original baseline", () => {
    const baseline = frame("left_eye", 0);
    const target = createMeasurementTarget(
      baseline,
      frame("left_eye", 1),
      "left_eye",
    );
    const points = structuredClone(recordedLandmarks.points);
    for (const [upper, lower] of [
      [386, 374],
      [385, 380],
    ]) {
      points[lower].x = points[upper].x;
      points[lower].y = points[upper].y;
    }
    const result = measureCheckpoint({
      baseline,
      checkpoint: frame("left_eye", 0.5, undefined, points),
      target,
    });
    expect(result.reason).toBe("eye_state_changed");
    expect(result.progress).toBeNull();
  });

  it("abstains when the visible upper-lid region has insufficient pixels", () => {
    const original = frame("right_eye", 0);
    const target = createMeasurementTarget(
      original,
      frame("right_eye", 1),
      "right_eye",
    );
    const points = structuredClone(recordedLandmarks.points);
    const indices = new Set([
      ...REGION_LANDMARKS.right_eye,
      ...EYE_LANDMARKS.right_eye,
    ]);
    for (const index of indices) {
      points[index].x = 0.4 + (points[index].x - 0.4) * 0.1;
      points[index].y = 0.39 + (points[index].y - 0.39) * 0.1;
    }
    const baseline = frame("right_eye", 0, undefined, points);
    const result = measureCheckpoint({
      baseline,
      checkpoint: frame("right_eye", 1, undefined, points),
      target,
    });
    expect(result.reason).toBe("too_few_pixels");
    expect(result.progress).toBeNull();
  });

  it("declines degenerate eye geometry even when the whole face is eligible", () => {
    const source = frame("left_eye", 0);
    const target = createMeasurementTarget(
      source,
      frame("left_eye", 1),
      "left_eye",
    );
    const points = structuredClone(recordedLandmarks.points);
    points[362] = { ...points[263] };
    const baseline = frame("left_eye", 0, undefined, points);
    expect(
      measureCheckpoint({ baseline, checkpoint: baseline, target }).reason,
    ).toBe("ineligible_face");
  });

  it("declines a cached target without usable spatial support", () => {
    const baseline = frame("right_eye", 0);
    const full = frame("right_eye", 1);
    const target = createMeasurementTarget(baseline, full, "right_eye");
    const result = measureCheckpoint({
      baseline,
      checkpoint: full,
      target: { ...target, cells: [] },
    });
    expect(result.reason).toBe("too_few_pixels");
    expect(result.verdict).toBe("insufficient");
    expect(result.progress).toBeNull();
    expect(result.uniformity).toBeNull();
  });

  it("retains near-zero abstention rather than forcing thin-line feedback", () => {
    const baseline = frame("left_eye", 0);
    const target = createMeasurementTarget(baseline, baseline, "left_eye");
    expect(target.reason).toBe("target_too_subtle");
    expect(regionExclusions(recordedLandmarks.points, "left_eye")).toHaveLength(
      1,
    );
  });
});
