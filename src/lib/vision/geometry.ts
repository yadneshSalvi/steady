import type { Region } from "@/lib/contracts";
export interface Point {
  x: number;
  y: number;
  z?: number;
}
export function projectPoint(
  point: Point,
  source: { width: number; height: number },
  viewport: { width: number; height: number },
  mirrored: boolean,
): Point {
  const scale = Math.max(
    viewport.width / source.width,
    viewport.height / source.height,
  );
  const cropX = (source.width * scale - viewport.width) / 2;
  const cropY = (source.height * scale - viewport.height) / 2;
  const x = point.x * source.width * scale - cropX;
  return {
    x: mirrored ? viewport.width - x : x,
    y: point.y * source.height * scale - cropY,
  };
}
export const REGION_LANDMARKS: Record<Region, number[]> = {
  left_cheek: [280, 330, 425, 411, 352, 345],
  right_cheek: [50, 101, 205, 187, 123, 116],
  lips: [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91],
};
export function faceEligible(points: Point[]): boolean {
  if (points.length < 468) return false;
  const left = points[234],
    right = points[454],
    nose = points[1],
    top = points[10],
    bottom = points[152];
  const width = Math.abs(right.x - left.x);
  const height = bottom.y - top.y;
  if (
    width < 0.16 ||
    height < 0.2 ||
    left.x < 0.02 ||
    right.x > 0.98 ||
    top.y < 0.01 ||
    bottom.y > 0.99
  )
    return false;
  return Math.abs(nose.x - (left.x + right.x) / 2) / width < 0.28;
}
