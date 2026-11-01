import { describe, it, expect } from "vitest";
import {
  projectPoint,
  faceEligible,
  REGION_LANDMARKS,
  CHEEK_OVAL_SEGMENTS,
  regionPolygon,
} from "@/lib/vision/geometry";
import { regionPolygon as measurementPolygon } from "@/lib/vision/measure";
import fixture from "./fixtures/sample-landmarks.json";
describe("face guide coordinate contract", () => {
  it("applies cover crop then mirrors exactly once", () => {
    expect(
      projectPoint(
        { x: 0.25, y: 0.5 },
        { width: 800, height: 600 },
        { width: 400, height: 600 },
        false,
      ),
    ).toEqual({ x: 0, y: 300 });
    expect(
      projectPoint(
        { x: 0.25, y: 0.5 },
        { width: 800, height: 600 },
        { width: 400, height: 600 },
        true,
      ),
    ).toEqual({ x: 400, y: 300 });
  });
  it("preserves anatomical region indices across display mirroring", () => {
    expect(REGION_LANDMARKS.left_cheek).not.toEqual(
      REGION_LANDMARKS.right_cheek,
    );
    const point = { x: 0.7, y: 0.4 };
    const a = projectPoint(
      point,
      { width: 100, height: 100 },
      { width: 100, height: 100 },
      false,
    );
    const b = projectPoint(
      point,
      { width: 100, height: 100 },
      { width: 100, height: 100 },
      true,
    );
    expect(a.x + b.x).toBe(100);
    expect(a.y).toBe(b.y);
  });
  it("hides incomplete face evidence", () => {
    expect(faceEligible([])).toBe(false);
    expect(
      faceEligible(Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }))),
    ).toBe(false);
  });
});

describe("shared cheekbone and apple geometry", () => {
  it("uses the exact same region helper for guide and measurement", () => {
    expect(measurementPolygon).toBe(regionPolygon);
  });

  it.each(["left_cheek", "right_cheek"] as const)(
    "forms a smooth convex oval higher on %s for the exact source fixture",
    (region) => {
      const polygon = regionPolygon(fixture.points, region);
      expect(polygon).toHaveLength(CHEEK_OVAL_SEGMENTS);
      expect(
        polygon.every(
          (point) => point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1,
        ),
      ).toBe(true);
      const turns = polygon.map((a, index) => {
        const b = polygon[(index + 1) % polygon.length],
          c = polygon[(index + 2) % polygon.length];
        return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
      });
      expect(new Set(turns).size).toBe(1);
      expect(turns[0]).not.toBe(0);
      const center = {
        x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
        y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length,
      };
      const oldCenterY =
        REGION_LANDMARKS[region].reduce(
          (sum, index) => sum + fixture.points[index].y,
          0,
        ) / REGION_LANDMARKS[region].length;
      expect(center.y).toBeLessThan(oldCenterY);
      expect(center.y).toBeLessThan(fixture.points[61].y);
      expect(
        region === "left_cheek"
          ? center.x > fixture.points[1].x
          : center.x < fixture.points[1].x,
      ).toBe(true);
    },
  );

  it("follows pixel-space roll, scale, and image reflection without reassigning anatomical sides", () => {
    const width = fixture.source.width,
      height = fixture.source.height,
      angle = (6 * Math.PI) / 180;
    const transform = (point: { x: number; y: number }) => ({
      x:
        0.5 +
        (((point.x - 0.5) * width * Math.cos(angle) -
          (point.y - 0.5) * height * Math.sin(angle)) *
          0.9) /
          width,
      y:
        0.5 +
        (((point.x - 0.5) * width * Math.sin(angle) +
          (point.y - 0.5) * height * Math.cos(angle)) *
          0.9) /
          height,
    });
    const moved = fixture.points.map(transform);
    const reflected = fixture.points.map((point) => ({
      x: 1 - point.x,
      y: point.y,
    }));
    for (const region of ["left_cheek", "right_cheek"] as const) {
      const original = regionPolygon(fixture.points, region),
        rotated = regionPolygon(moved, region),
        mirrored = regionPolygon(reflected, region);
      expect(rotated).toHaveLength(original.length);
      original.forEach((point, index) => {
        const expected = transform(point);
        expect(rotated[index].x).toBeCloseTo(expected.x, 12);
        expect(rotated[index].y).toBeCloseTo(expected.y, 12);
        expect(mirrored[index].x).toBeCloseTo(1 - point.x, 12);
        expect(mirrored[index].y).toBeCloseTo(point.y, 12);
      });
    }
  });

  it("keeps eye and lip outlines unchanged and hides missing or degenerate cheek anchors", () => {
    for (const region of ["left_eye", "right_eye", "lips"] as const)
      expect(regionPolygon(fixture.points, region)).toEqual(
        REGION_LANDMARKS[region].map((index) => ({
          x: fixture.points[index].x,
          y: fixture.points[index].y,
        })),
      );
    expect(regionPolygon([], "left_cheek")).toEqual([]);
    const nonfinite = structuredClone(fixture.points);
    nonfinite[330].x = Number.NaN;
    expect(regionPolygon(nonfinite, "left_cheek")).toEqual([]);
    const outside = structuredClone(fixture.points);
    outside[346].x = 1.2;
    expect(regionPolygon(outside, "left_cheek")).toEqual([]);
    expect(
      regionPolygon(
        Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 })),
        "right_cheek",
      ),
    ).toEqual([]);
  });
});
