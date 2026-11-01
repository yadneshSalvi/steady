import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import records from "./fixtures/measurement-recordings-r1.json";
import landmarks from "./fixtures/sample-landmarks.json";
import {
  createMeasurementTarget,
  measureCheckpoint,
  type MeasurementFrame,
} from "@/lib/vision/measure";

const cache = new Map<string, Promise<MeasurementFrame>>();
function load(url: string): Promise<MeasurementFrame> {
  let loading = cache.get(url);
  if (!loading) {
    loading = sharp(`public${url}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({
        image: {
          width: info.width,
          height: info.height,
          data: new Uint8ClampedArray(data),
        },
        landmarks: landmarks.points,
      }));
    cache.set(url, loading);
  }
  return loading;
}

describe("all 31 frozen R1 recordings under exact v1, v2 and current v3 geometry", () => {
  it("binds the historical catalog to the exact source and all 31 unchanged PNG bytes", () => {
    const hash = (path: string) =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(records.records).toHaveLength(31);
    expect(
      new Set(records.records.map((record) => record.output.url)).size,
    ).toBe(31);
    expect(records.source.sha256).toBe(landmarks.source.sha256);
    expect(hash(`public${records.source.url}`)).toBe(records.source.sha256);
    for (const manifest of records.manifests)
      expect(hash(manifest.path)).toBe(manifest.sha256);
    for (const record of records.records)
      expect(hash(`public${record.output.url}`)).toBe(record.output.sha256);
  });

  it.each(
    records.records.flatMap((record) =>
      (
        [
          "landmark-polygon-v1",
          "cheekbone-oval-v2",
          "blush-centroid-oval-v3",
        ] as const
      ).map((geometryVersion) => ({
        record,
        geometryVersion,
        label: `${geometryVersion}/${record.catalog}/${record.lookId}/${record.routeId}/${record.level}`,
      })),
    ),
  )(
    "re-measures both anatomical regions for $label",
    async ({ record, geometryVersion }) => {
      const source = await load(records.source.url),
        checkpoint = await load(record.output.url);
      const regions =
        record.catalog === "eyes-r1"
          ? (["left_eye", "right_eye"] as const)
          : (["left_cheek", "right_cheek"] as const);
      for (const region of regions) {
        const target = createMeasurementTarget(
          source,
          checkpoint,
          region,
          geometryVersion,
        );
        const measured = measureCheckpoint({
          baseline: source,
          checkpoint,
          target,
        });
        const subtle =
          (record.catalog === "cheek-ladder" &&
            record.lookId === "terracotta" &&
            (geometryVersion === "landmark-polygon-v1"
              ? record.level === "light" ||
                (record.texture === "satin" &&
                  record.level === "build" &&
                  region === "left_cheek")
              : record.texture === "satin" &&
                record.level === "light" &&
                region === "left_cheek")) ||
          (record.catalog === "eyes-r1" &&
            record.routeId === "liner" &&
            record.level === "light" &&
            region === "left_eye");
        if (subtle) {
          expect(target.valid).toBe(false);
          expect(target.reason).toBe("target_too_subtle");
          expect(measured.verdict).toBe("insufficient");
          expect(measured.progress).toBeNull();
          continue;
        }
        expect(target.valid, target.reason).toBe(true);
        expect(measured.verdict, measured.reason).toBe("at_target");
        expect(Math.abs(measured.progress! - 1)).toBeLessThanOrEqual(0.15);
        expect(measured.heatmap.length).toBeGreaterThan(0);
      }
    },
  );
});
