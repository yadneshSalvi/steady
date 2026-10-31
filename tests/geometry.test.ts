import { describe, it, expect } from "vitest";
import {
  projectPoint,
  faceEligible,
  REGION_LANDMARKS,
} from "@/lib/vision/geometry";
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
