import { describe, expect, it } from "vitest";
import { smoothHeatmap, unionCrop } from "@/lib/vision/display";
import { regionCrop } from "@/lib/vision/measure";
import { areaReading } from "@/lib/vision/measurement-guidance";
import sample from "./fixtures/sample-landmarks.json";

const box = { x: 0.2, y: 0.4, width: 0.4, height: 0.2 };
const grid = (value: (row: number, column: number) => number) =>
  Array.from({ length: 16 }, (_, index) => {
    const row = Math.floor(index / 4),
      column = index % 4;
    return { id: `${row}:${column}`, progress: value(row, column) };
  });

describe("display-only heatmap smoothing", () => {
  it("keeps a uniform measurement uniform and covers the region plus one edge ring", () => {
    const tiles = smoothHeatmap(
      grid(() => 0.6),
      box,
    );
    expect(tiles).toHaveLength(10 * 10);
    expect(tiles.every((tile) => Math.abs(tile.progress - 0.6) < 1e-9)).toBe(
      true,
    );
    const xs = tiles.map((tile) => tile.x);
    expect(Math.min(...xs)).toBeCloseTo(box.x - box.width / 8);
    expect(Math.max(...xs) + box.width / 8).toBeCloseTo(
      box.x + box.width + box.width / 8,
    );
  });

  it("interpolates between measured cells without leaving their range", () => {
    const cells = grid((_, column) => column * 0.4);
    const tiles = smoothHeatmap(cells, box);
    const row = tiles.filter((tile) => tile.id.startsWith("3:"));
    const values = row.map((tile) => tile.progress);
    for (let index = 1; index < values.length; index++)
      expect(values[index]).toBeGreaterThanOrEqual(values[index - 1] - 1e-9);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(1.2 + 1e-9);
    // Input cells are never modified.
    expect(cells.map((cell) => cell.progress)).toEqual(
      grid((_, column) => column * 0.4).map((cell) => cell.progress),
    );
  });

  it("does not paint inside a cell the measurement skipped", () => {
    const cells = grid(() => 0.5).filter((cell) => cell.id !== "1:1");
    const tiles = smoothHeatmap(cells, box);
    expect(
      tiles.some((tile) => ["2:2", "2:3", "3:2", "3:3"].includes(tile.id)),
    ).toBe(false);
    expect(tiles.some((tile) => tile.id === "2:4")).toBe(true);
  });
});

describe("method crops", () => {
  it("joins both cheeks into one window that contains each cheek crop", () => {
    const left = regionCrop(sample.points, "left_cheek", 0.28)!;
    const right = regionCrop(sample.points, "right_cheek", 0.28)!;
    const both = unionCrop([left, right, null])!;
    for (const part of [left, right]) {
      expect(both.x).toBeLessThanOrEqual(part.x);
      expect(both.y).toBeLessThanOrEqual(part.y);
      expect(both.x + both.width).toBeGreaterThanOrEqual(part.x + part.width);
      expect(both.y + both.height).toBeGreaterThanOrEqual(part.y + part.height);
    }
    expect(unionCrop([null])).toBeNull();
  });
});

describe("per-area reading", () => {
  const regionalProgress = [
    { subregion: "upper" as const, progress: 0.212, pixels: 90 },
    { subregion: "lower" as const, progress: 0.561, pixels: 90 },
    { subregion: "outer" as const, progress: 0.23, pixels: 90 },
    { subregion: "inner" as const, progress: 0.534, pixels: 90 },
  ];
  it("follows the axis of the main guidance", () => {
    expect(
      areaReading({
        region: "left_cheek",
        verdict: "build",
        lagging: "upper",
        regionalProgress,
      }),
    ).toBe("Upper 21% · lower 56%");
    expect(
      areaReading({
        region: "right_cheek",
        verdict: "build",
        lagging: "outer",
        regionalProgress,
      }),
    ).toBe("Outer 23% · inner 53%");
    expect(
      areaReading({
        region: "left_eye",
        verdict: "at_target",
        lagging: null,
        regionalProgress,
      }),
    ).toBe("Outer 23% · inner 53%");
  });
  it("stays silent without usable evidence", () => {
    expect(
      areaReading({
        region: "left_cheek",
        verdict: "insufficient",
        lagging: null,
        regionalProgress,
      }),
    ).toBeNull();
    expect(
      areaReading({
        region: "lips",
        verdict: "build",
        lagging: null,
        regionalProgress,
      }),
    ).toBeNull();
    expect(
      areaReading({
        region: "left_cheek",
        verdict: "build",
        lagging: "upper",
        regionalProgress: regionalProgress.slice(2),
      }),
    ).toBeNull();
  });
});
