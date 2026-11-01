import { describe, expect, it } from "vitest";
import { containedRegionViewBox, heatmapColor } from "@/lib/vision/display";
import { regionCrop, regionPolygon } from "@/lib/vision/measure";
import sample from "./fixtures/sample-landmarks.json";

describe("complete measured-region crops", () => {
  it.each(["left_cheek", "right_cheek", "left_eye", "right_eye"] as const)(
    "contains the entire %s outline and padding at laptop, phone and compact-target ratios",
    (region) => {
      const image = { width: 1024, height: 1280 };
      const crop = regionCrop(sample.points, region, 0.28)!;
      for (const viewport of [
        { width: 420, height: 180 },
        { width: 140, height: 145 },
        { width: 144, height: 80 },
        { width: 300, height: 160 },
      ]) {
        const box = containedRegionViewBox(crop, image, viewport);
        expect(box.width / box.height).toBeCloseTo(
          viewport.width / viewport.height,
          10,
        );
        expect(box.x).toBeLessThanOrEqual(crop.x * image.width + 1e-8);
        expect(box.y).toBeLessThanOrEqual(crop.y * image.height + 1e-8);
        expect(box.x + box.width).toBeGreaterThanOrEqual(
          (crop.x + crop.width) * image.width - 1e-8,
        );
        expect(box.y + box.height).toBeGreaterThanOrEqual(
          (crop.y + crop.height) * image.height - 1e-8,
        );
        for (const point of regionPolygon(sample.points, region)) {
          expect(point.x * image.width).toBeGreaterThan(box.x);
          expect(point.x * image.width).toBeLessThan(box.x + box.width);
          expect(point.y * image.height).toBeGreaterThan(box.y);
          expect(point.y * image.height).toBeLessThan(box.y + box.height);
        }
      }
    },
  );

  it("uses a graded display scale without changing values or hiding low-signal cells", () => {
    expect(heatmapColor(0)).not.toBe(heatmapColor(0.25));
    expect(heatmapColor(0.25)).not.toBe(heatmapColor(0.5));
    expect(heatmapColor(-1)).toBe(heatmapColor(0));
    expect(heatmapColor(2)).toBe(heatmapColor(1.5));
  });
});
