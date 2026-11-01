import { srgbToLab, type MeasurementFrame } from "./measure";
import type { Point } from "./geometry";

export interface CentroidBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface DeltaACentroid {
  point: Point;
  positiveDeltaAMass: number;
  pixels: number;
}

/**
 * Offline placement diagnostic from exact aligned source/render pixels.
 * The caller supplies an independent ROI, never the fitted measurement oval.
 * Positive target-minus-source a* is the centroid weight; no camera gains or
 * perceptual/magnitude cutoff is fitted here. This is not human calibration.
 */
export function deltaACentroid(
  source: MeasurementFrame["image"],
  target: MeasurementFrame["image"],
  roi: CentroidBounds,
): DeltaACentroid | null {
  if (
    source.width !== target.width ||
    source.height !== target.height ||
    !Number.isInteger(source.width) ||
    !Number.isInteger(source.height) ||
    source.width < 1 ||
    source.height < 1 ||
    source.data.length !== source.width * source.height * 4 ||
    target.data.length !== target.width * target.height * 4 ||
    !Object.values(roi).every(Number.isFinite) ||
    roi.left < 0 ||
    roi.right > 1 ||
    roi.top < 0 ||
    roi.bottom > 1 ||
    roi.left >= roi.right ||
    roi.top >= roi.bottom
  )
    return null;
  let mass = 0,
    weightedX = 0,
    weightedY = 0,
    pixels = 0;
  for (
    let y = Math.floor(roi.top * source.height);
    y < Math.ceil(roi.bottom * source.height);
    y++
  ) {
    for (
      let x = Math.floor(roi.left * source.width);
      x < Math.ceil(roi.right * source.width);
      x++
    ) {
      const nx = (x + 0.5) / source.width,
        ny = (y + 0.5) / source.height;
      if (nx < roi.left || nx > roi.right || ny < roi.top || ny > roi.bottom)
        continue;
      const at = (y * source.width + x) * 4;
      if (
        source.data[at + 3] < 250 ||
        target.data[at + 3] < 250 ||
        (source.data[at] === target.data[at] &&
          source.data[at + 1] === target.data[at + 1] &&
          source.data[at + 2] === target.data[at + 2])
      )
        continue;
      const before = srgbToLab([
        source.data[at],
        source.data[at + 1],
        source.data[at + 2],
      ]);
      const after = srgbToLab([
        target.data[at],
        target.data[at + 1],
        target.data[at + 2],
      ]);
      const weight = Math.max(0, after[1] - before[1]);
      if (!weight) continue;
      mass += weight;
      weightedX += nx * weight;
      weightedY += ny * weight;
      pixels++;
    }
  }
  return mass > 0
    ? {
        point: { x: weightedX / mass, y: weightedY / mass },
        positiveDeltaAMass: mass,
        pixels,
      }
    : null;
}

/** Broad lower-eye→mouth face bounds; independent of every guide version. */
export function cheekCentroidBounds(
  points: readonly Point[],
  region: "left_cheek" | "right_cheek",
): CentroidBounds | null {
  if (
    ![1, 10, 17, 61, 145, 152, 234, 291, 374, 454].every(
      (index) =>
        points[index] &&
        Number.isFinite(points[index].x) &&
        Number.isFinite(points[index].y),
    )
  )
    return null;
  const top = Math.min(points[145].y, points[374].y);
  const bottom =
    Math.max(points[61].y, points[291].y, points[17].y) +
    0.04 * (points[152].y - points[10].y);
  const [left, right] =
    region === "left_cheek"
      ? [points[1].x, points[454].x]
      : [points[234].x, points[1].x];
  return left >= 0 &&
    left < right &&
    right <= 1 &&
    top >= 0 &&
    top < bottom &&
    bottom <= 1
    ? { left, right, top, bottom }
    : null;
}
