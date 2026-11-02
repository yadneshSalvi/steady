import { describe, expect, it } from "vitest";
import {
  containedRegionViewBox,
  heatmapColor,
  heatmapGradient,
  heatmapOpacity,
} from "@/lib/vision/display";
import { LOOKS } from "@/lib/catalog";
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

  it.each(LOOKS)(
    "uses the $id shade with increasing pigment and alpha",
    (look) => {
      const channels = (color: string) => color.match(/\d+/g)!.map(Number);
      const target = [1, 3, 5].map((index) =>
        parseInt(look.color.slice(index, index + 2), 16),
      );
      expect(channels(heatmapColor(1, look.color))).toEqual(target);
      const brightness = [0, 0.5, 1, 1.5].map((progress) => {
        const [red, green, blue] = channels(heatmapColor(progress, look.color));
        // Warm rose, terracotta, berry and brown remain red-led at every stop.
        expect(red).toBeGreaterThan(green);
        expect(red).toBeGreaterThan(blue);
        return red + green + blue;
      });
      expect(brightness).toEqual([...brightness].sort((a, b) => b - a));
      for (const full of [false, true]) {
        const alpha = [0, 0.5, 1, 1.5].map((progress) =>
          heatmapOpacity(progress, full),
        );
        expect(alpha[0]).toBeCloseTo(0.13);
        expect(alpha[1]).toBeGreaterThan(alpha[0]);
        expect(alpha[2]).toBeGreaterThan(alpha[1]);
        expect(alpha[3]).toBeGreaterThan(alpha[2]);
        expect(heatmapOpacity(-1, full)).toBe(alpha[0]);
        expect(heatmapOpacity(2, full)).toBe(alpha[3]);
        // The legend uses the same target color/alpha at the 100% position,
        // with a warm skin backing rather than an opaque unrelated gradient.
        expect(heatmapGradient(look.color, full)).toContain(
          `${heatmapColor(1, look.color).replace(")", ` / ${alpha[2]})`)} `,
        );
        expect(heatmapGradient(look.color, full)).toContain("#C9977E");
      }
    },
  );
});
