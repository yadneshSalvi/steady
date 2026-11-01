import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import recordings from "../public/examples/recorded-round2.json";
import ladder from "../public/examples/recorded-ladders.json";
import sourceLandmarks from "./fixtures/sample-landmarks.json";
import {
  createMeasurementTarget,
  measureCheckpoint,
  srgbToLab,
  type MeasurementFrame,
} from "@/lib/vision/measure";
import { secondarySpatialGuidance } from "@/lib/vision/measurement-guidance";

const manifestSha256 =
  "5d4560f533cf985b97fc7c2d9015e2738621f08709867e3c8ecb4456a6c5fe97";
const frames = new Map<string, Promise<MeasurementFrame>>();
function load(url: string): Promise<MeasurementFrame> {
  let pending = frames.get(url);
  if (!pending) {
    pending = sharp(`public${url}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({
        image: {
          data: new Uint8ClampedArray(data),
          width: info.width,
          height: info.height,
        },
        landmarks: sourceLandmarks.points,
      }));
    frames.set(url, pending);
  }
  return pending;
}

const firstPasses = recordings.records.filter(
  (record) => record.purpose === "simulated_first_pass",
);
const cheekCases = firstPasses.flatMap((record) =>
  (["left_cheek", "right_cheek"] as const).flatMap((region) =>
    (["cheekbone-oval-v2", "blush-centroid-oval-v3"] as const).map(
      (geometryVersion) => ({
        record,
        region,
        geometryVersion,
        label: `${geometryVersion}/${record.id}/${region}`,
      }),
    ),
  ),
);
const lightShadow = recordings.records.find(
  (record) => record.id === "shadow-light-warm-v2",
)!;
const fullShadow = recordings.records.find(
  (record) => record.id === "shadow-full-warm-v2",
)!;

describe("published R2 actual pixels on the pinned fictional source", () => {
  it("pins the approved manifest, source, and eight exact output files", () => {
    const hash = (path: string) =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(hash("public/examples/recorded-round2.json")).toBe(manifestSha256);
    expect(recordings.source.sha256).toBe(sourceLandmarks.source.sha256);
    expect(hash(`public${recordings.source.url}`)).toBe(
      recordings.source.sha256,
    );
    expect(firstPasses).toHaveLength(6);
    expect(recordings.records).toHaveLength(8);
    for (const record of recordings.records) {
      expect(record.inputSha256).toBe(recordings.source.sha256);
      expect(hash(`public${record.output.url}`)).toBe(record.output.sha256);
      expect(record.output.width).toBe(sourceLandmarks.source.width);
      expect(record.output.height).toBe(sourceLandmarks.source.height);
      expect(record.attempts).toBe(1);
    }
  });

  it.each(cheekCases)(
    "derives spatial guidance from $label against each chosen target",
    async ({ record, region, geometryVersion }) => {
      const baseline = await load(recordings.source.url);
      const checkpoint = await load(record.output.url);
      for (const level of ["light", "build", "full"] as const) {
        const targetRecord = ladder.records.find(
          (target) =>
            target.lookId === record.lookId &&
            target.texture === record.texture &&
            target.level === level,
        )!;
        const target = createMeasurementTarget(
          baseline,
          await load(targetRecord.output.url),
          region,
          geometryVersion,
        );
        const result = measureCheckpoint({ baseline, checkpoint, target });

        if (
          record.id === "blush-terracotta-satin" &&
          region === "left_cheek" &&
          level === "light"
        ) {
          expect(target.valid).toBe(false);
          expect(result.reason).toBe("target_too_subtle");
          expect(result.progress).toBeNull();
          expect(result.heatmap).toEqual([]);
          expect(secondarySpatialGuidance(result)).toBeNull();
          continue;
        }
        expect(target.valid, target.reason).toBe(true);
        expect(result.lagging).toBe("upper");
        expect(result.uniformity).toBeGreaterThan(0.25);
        expect(result.uniformity).toBeLessThan(0.65);
        expect(result.diagnostics.heldOutDeltaE00).toBe(0);
        expect(result.diagnostics.spatialLightingDeltaE00).toBe(0);
        expect(result.heatmap.length).toBeGreaterThan(4);
        const inner = result.regionalProgress!.find(
          (part) => part.subregion === "inner",
        )!;
        const outer = result.regionalProgress!.find(
          (part) => part.subregion === "outer",
        )!;
        expect(inner.pixels).toBeGreaterThan(100);
        expect(outer.pixels).toBeGreaterThan(100);
        expect(inner.progress - outer.progress).toBeGreaterThan(0.12);

        if (level === "light") {
          // A regional mean can be at/over a light target while still uneven.
          expect(result.verdict).toBe(
            record.id === "blush-terracotta-satin" && region === "right_cheek"
              ? "over"
              : "at_target",
          );
          expect(secondarySpatialGuidance(result)).toBeNull();
        } else {
          expect(result.verdict, result.reason).toBe("build");
          expect(result.progress).toBeGreaterThan(
            level === "full" ? 0.3 : 0.45,
          );
          expect(result.progress).toBeLessThan(level === "full" ? 0.5 : 0.7);
          expect(secondarySpatialGuidance(result)).toContain("toward your ear");
        }
      }
    },
  );

  it.each(["left_eye", "right_eye"] as const)(
    "keeps both warmer shadow targets eligible and measures Light→Full on %s",
    async (region) => {
      const baseline = await load(recordings.source.url);
      const light = await load(lightShadow.output.url);
      const full = await load(fullShadow.output.url);
      const target = createMeasurementTarget(baseline, full, region);
      const selectedLight = createMeasurementTarget(baseline, light, region);
      expect(target.valid, target.reason).toBe(true);
      expect(selectedLight.valid, selectedLight.reason).toBe(true);
      const first = measureCheckpoint({ baseline, checkpoint: light, target });
      expect(first.verdict, first.reason).toBe("build");
      expect(first.progress).toBeGreaterThan(0.5);
      expect(first.progress).toBeLessThan(0.7);
      expect(first.exclusions).toHaveLength(1);
      for (const [checkpoint, chosenTarget] of [
        [full, target],
        [light, selectedLight],
      ] as const) {
        const self = measureCheckpoint({
          baseline,
          checkpoint,
          target: chosenTarget,
        });
        expect(self.verdict, self.reason).toBe("at_target");
        expect(Math.abs(self.progress! - 1)).toBeLessThanOrEqual(0.15);
      }
      const unchanged = measureCheckpoint({
        baseline,
        checkpoint: baseline,
        target,
      });
      expect(unchanged.progress).toBe(0);
    },
  );
});

type PixelPoint = { x: number; y: number };
// Independently fixed below-eye pixels, outside the upper-lid measurement mask.
function belowEyePatch(region: "left_eye" | "right_eye"): PixelPoint[] {
  const { width, height } = sourceLandmarks.source;
  const [outer, inner, lower, lower2] = (
    region === "left_eye" ? [263, 362, 374, 380] : [33, 133, 145, 153]
  ).map((index) => ({
    x: sourceLandmarks.points[index].x * width,
    y: sourceLandmarks.points[index].y * height,
  }));
  const dx = inner.x - outer.x,
    dy = inner.y - outer.y;
  const eyeWidth = Math.hypot(dx, dy);
  const across = { x: dx / eyeWidth, y: dy / eyeWidth };
  const downSign = across.x < 0 ? -1 : 1;
  const down = { x: -across.y * downSign, y: across.x * downSign };
  const center = { x: (outer.x + inner.x) / 2, y: (lower.y + lower2.y) / 2 };
  return [
    [-0.38, 0.07],
    [0.38, 0.07],
    [0.38, 0.23],
    [-0.38, 0.23],
  ].map(([horizontal, depth]) => ({
    x: center.x + eyeWidth * (across.x * horizontal + down.x * depth),
    y: center.y + eyeWidth * (across.y * horizontal + down.y * depth),
  }));
}
function inside(point: PixelPoint, polygon: PixelPoint[]): boolean {
  let hit = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const a = polygon[index],
      b = polygon[previous];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
}

describe("fixed added-darkening audit, not natural-shadow removal", () => {
  it.each(["left_eye", "right_eye"] as const)(
    "keeps revised Light/Full RGB unchanged in the source-defined patch below %s",
    async (region) => {
      const source = await load(recordings.source.url);
      const old = await load("/examples/eyes/shadow-full.png");
      const revised = [
        await load(lightShadow.output.url),
        await load(fullShadow.output.url),
      ];
      const polygon = belowEyePatch(region);
      let pixels = 0,
        oldDeltaL = 0,
        oldDarkenedPixels = 0;
      for (
        let y = Math.floor(Math.min(...polygon.map((p) => p.y)));
        y < Math.ceil(Math.max(...polygon.map((p) => p.y)));
        y++
      ) {
        for (
          let x = Math.floor(Math.min(...polygon.map((p) => p.x)));
          x < Math.ceil(Math.max(...polygon.map((p) => p.x)));
          x++
        ) {
          if (!inside({ x: x + 0.5, y: y + 0.5 }, polygon)) continue;
          const offset = (y * source.image.width + x) * 4;
          const rgb = (frame: MeasurementFrame): [number, number, number] => [
            frame.image.data[offset],
            frame.image.data[offset + 1],
            frame.image.data[offset + 2],
          ];
          const sourceRgb = rgb(source);
          const change = srgbToLab(rgb(old))[0] - srgbToLab(sourceRgb)[0];
          oldDeltaL += change;
          if (change < -1) oldDarkenedPixels++;
          for (const frame of revised) expect(rgb(frame)).toEqual(sourceRgb);
          pixels++;
        }
      }
      expect(pixels).toBe(region === "left_eye" ? 1150 : 1103);
      expect(oldDeltaL / pixels).toBeLessThan(-2);
      expect(oldDarkenedPixels).toBe(pixels);
    },
  );
});
