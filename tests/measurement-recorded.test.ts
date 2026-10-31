import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "../public/examples/recorded-ladders.json";
import eyesManifest from "../public/examples/recorded-eyes.json";
import { makeRecipe } from "@/lib/youcam/recipes";
import recordedLandmarks from "./fixtures/sample-landmarks.json";
import {
  createMeasurementTarget,
  measureCheckpoint,
  REFERENCE_LANDMARKS,
  srgbChannelToLinear,
  type MeasurementFrame,
} from "@/lib/vision/measure";

const cache = new Map<string, Promise<MeasurementFrame>>();
function loadFrame(url: string): Promise<MeasurementFrame> {
  let pending = cache.get(url);
  if (!pending) {
    pending = sharp(`public${url}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({
        image: {
          width: info.width,
          height: info.height,
          data: new Uint8ClampedArray(data),
        },
        landmarks: recordedLandmarks.points,
      }));
    cache.set(url, pending);
  }
  return pending;
}

const cases = manifest.records
  .filter((record) => record.level === "full")
  .flatMap((full) =>
    (["left_cheek", "right_cheek"] as const).map((region) => ({
      full,
      region,
      label: `${full.lookId}/${full.texture}/${region}`,
    })),
  );

function relight(
  frame: MeasurementFrame,
  gains: readonly number[],
  within?: (x: number, y: number) => boolean,
): MeasurementFrame {
  const { width, height } = frame.image;
  const data = new Uint8ClampedArray(frame.image.data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (within && !within((x + 0.5) / width, (y + 0.5) / height)) continue;
      for (let channel = 0; channel < 3; channel++) {
        const offset = (y * width + x) * 4 + channel;
        const linear = Math.min(
          1,
          srgbChannelToLinear(data[offset]) * gains[channel],
        );
        data[offset] = Math.round(
          255 *
            (linear <= 0.0031308
              ? linear * 12.92
              : 1.055 * linear ** (1 / 2.4) - 0.055),
        );
      }
    }
  }
  return { ...frame, image: { width, height, data } };
}

describe("recorded YouCam ladder on one synthetic source portrait", () => {
  it("binds the actual IMAGE landmarks to the exact source and installed model", () => {
    const hash = (path: string) =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(recordedLandmarks.points).toHaveLength(478);
    expect(recordedLandmarks.model.runningMode).toBe("IMAGE");
    expect(hash(recordedLandmarks.source.path)).toBe(
      recordedLandmarks.source.sha256,
    );
    expect(recordedLandmarks.source.sha256).toBe(manifest.source.sha256);
    expect(hash("public/models/face_landmarker.task")).toBe(
      recordedLandmarks.model.sha256,
    );
  });

  it.each(cases)(
    "measures source→light/build/full pixels for $label",
    async ({ full, region }) => {
      const source = await loadFrame(manifest.source.url);
      const fullFrame = await loadFrame(full.output.url);
      const target = createMeasurementTarget(source, fullFrame, region);
      expect(target.valid, target.reason).toBe(true);
      const measurements = [];
      for (const level of ["light", "build", "full"]) {
        const record = manifest.records.find(
          (item) =>
            item.lookId === full.lookId &&
            item.texture === full.texture &&
            item.level === level,
        )!;
        const checkpoint = await loadFrame(record.output.url);
        const measured = measureCheckpoint({
          baseline: source,
          checkpoint,
          target,
        });
        expect(measured.verdict, `${level}: ${measured.reason}`).not.toBe(
          "insufficient",
        );
        expect(measured.heatmap.length).toBeGreaterThan(0);
        measurements.push(measured);
      }
      // These are pipeline/fixture consistency checks, not physical calibration.
      expect(measurements[0].progress).toBeGreaterThan(0.2);
      expect(measurements[0].progress).toBeLessThan(0.6);
      expect(measurements[1].progress).toBeGreaterThan(
        measurements[0].progress! + 0.1,
      );
      expect(measurements[1].progress).toBeLessThan(0.9);
      expect(Math.abs(measurements[2].progress! - 1)).toBeLessThanOrEqual(0.15);
      expect(measurements[2].verdict).toBe("at_target");
    },
  );

  it("normalizes a synthetic global exposure change applied to recorded pixels", async () => {
    const full = manifest.records.find(
      (item) =>
        item.lookId === "rose" &&
        item.texture === "satin" &&
        item.level === "full",
    )!;
    const light = manifest.records.find(
      (item) =>
        item.lookId === "rose" &&
        item.texture === "satin" &&
        item.level === "light",
    )!;
    const source = await loadFrame(manifest.source.url);
    const target = createMeasurementTarget(
      source,
      await loadFrame(full.output.url),
      "left_cheek",
    );
    const checkpoint = await loadFrame(light.output.url);
    const control = measureCheckpoint({ baseline: source, checkpoint, target });
    const changed = measureCheckpoint({
      baseline: source,
      checkpoint: relight(checkpoint, [0.84, 0.84, 0.84]),
      target,
    });
    expect(changed.verdict, changed.reason).not.toBe("insufficient");
    expect(Math.abs(changed.progress! - control.progress!)).toBeLessThan(0.03);
  });

  it("retains five honest near-zero abstentions among the 36 selectable target regions", async () => {
    const source = await loadFrame(manifest.source.url);
    const abstentions: string[] = [];
    for (const record of manifest.records) {
      const checkpoint = await loadFrame(record.output.url);
      for (const region of ["left_cheek", "right_cheek"] as const) {
        const target = createMeasurementTarget(source, checkpoint, region);
        if (target.valid) continue;
        expect(target.reason).toBe("target_too_subtle");
        const measured = measureCheckpoint({
          baseline: source,
          checkpoint,
          target,
        });
        expect(measured.progress).toBeNull();
        expect(measured.heatmap).toEqual([]);
        abstentions.push(
          `${record.lookId}/${record.texture}/${record.level}/${region}`,
        );
      }
    }
    expect(abstentions.sort()).toEqual([
      "terracotta/matte/light/left_cheek",
      "terracotta/matte/light/right_cheek",
      "terracotta/satin/build/left_cheek",
      "terracotta/satin/light/left_cheek",
      "terracotta/satin/light/right_cheek",
    ]);
  });

  it("abstains when a held-out skin patch is relit independently of the fitted forehead", async () => {
    const full = manifest.records.find((item) => item.level === "full")!;
    const source = await loadFrame(manifest.source.url);
    const target = createMeasurementTarget(
      source,
      await loadFrame(full.output.url),
      "left_cheek",
    );
    const points = REFERENCE_LANDMARKS.heldOut.map(
      (index) => source.landmarks[index],
    );
    const minX = Math.min(...points.map((point) => point.x)),
      maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y)),
      maxY = Math.max(...points.map((point) => point.y));
    const checkpoint = relight(
      source,
      [0.6, 0.6, 0.6],
      (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY,
    );
    const result = measureCheckpoint({ baseline: source, checkpoint, target });
    expect(result.reason).toBe("lighting_changed");
    expect(result.diagnostics.gains).toEqual([1, 1, 1]);
    expect(result.diagnostics.heldOutDeltaE00).toBeGreaterThan(4.5);
    expect(result.progress).toBeNull();
  });
});

describe("recorded eye previews on the same synthetic source", () => {
  it("retains the subtle left-eye Light liner abstention among eight selectable eye targets", async () => {
    const source = await loadFrame(eyesManifest.source.url);
    const abstentions: string[] = [];
    for (const record of eyesManifest.records) {
      const checkpoint = await loadFrame(record.output.url);
      for (const region of ["left_eye", "right_eye"] as const) {
        const target = createMeasurementTarget(source, checkpoint, region);
        if (target.valid) continue;
        expect(target.reason).toBe("target_too_subtle");
        expect(
          measureCheckpoint({ baseline: source, checkpoint, target }).progress,
        ).toBeNull();
        abstentions.push(`${record.routeId}/${record.level}/${region}`);
      }
    }
    expect(abstentions).toEqual(["liner/light/left_eye"]);
  });
  it("binds all four actual eye outputs to the frozen source and catalog-derived recipes", () => {
    expect(eyesManifest.source.sha256).toBe(manifest.source.sha256);
    expect(eyesManifest.records).toHaveLength(4);
    for (const record of eyesManifest.records) {
      expect(record.inputSha256).toBe(manifest.source.sha256);
      expect(
        createHash("sha256")
          .update(readFileSync(`public${record.output.url}`))
          .digest("hex"),
      ).toBe(record.output.sha256);
      expect(record.recipe).toEqual(
        makeRecipe(
          "eyes",
          record.routeId as "liner" | "shadow",
          false,
          record.intensity as 25 | 65,
        ),
      );
    }
  });

  it.each(
    (["liner", "shadow"] as const).flatMap((route) =>
      (["left_eye", "right_eye"] as const).map((region) => ({ route, region })),
    ),
  )(
    "measures recorded $route on $region without changing thresholds",
    async ({ route, region }) => {
      const source = await loadFrame(eyesManifest.source.url);
      const fullRecord = eyesManifest.records.find(
        (record) => record.routeId === route && record.level === "full",
      )!;
      const lightRecord = eyesManifest.records.find(
        (record) => record.routeId === route && record.level === "light",
      )!;
      const full = await loadFrame(fullRecord.output.url);
      const target = createMeasurementTarget(source, full, region);
      expect(target.valid, target.reason).toBe(true);
      const light = measureCheckpoint({
        baseline: source,
        checkpoint: await loadFrame(lightRecord.output.url),
        target,
      });
      const complete = measureCheckpoint({
        baseline: source,
        checkpoint: full,
        target,
      });
      expect(light.verdict, light.reason).toBe("build");
      expect(light.progress).toBeGreaterThan(0.2);
      expect(light.progress).toBeLessThan(0.7);
      expect(light.heatmap.length).toBeGreaterThan(0);
      expect(light.exclusions).toHaveLength(1);
      expect(light.diagnostics.validPixels).toBeGreaterThanOrEqual(96);
      expect(complete.verdict, complete.reason).toBe("at_target");
      expect(Math.abs(complete.progress! - 1)).toBeLessThanOrEqual(0.15);
    },
  );
});
