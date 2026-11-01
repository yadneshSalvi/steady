import type {
  GeometryVersion,
  Region,
  StoredMeasurement,
} from "@/lib/contracts";
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
  // Historical cheek outline indices remain for fixture/provenance inspection.
  // Use regionPolygon for every displayed or measured region.
  left_cheek: [280, 330, 425, 411, 352, 345],
  right_cheek: [50, 101, 205, 187, 123, 116],
  lips: [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91],
  // Upper-lid skin between the crease-side row and upper eye contour. These
  // polygons are image regions, never contact/pressure or anatomical safety zones.
  left_eye: [
    467, 260, 259, 257, 258, 286, 414, 362, 398, 384, 385, 386, 387, 388, 466,
    263,
  ],
  right_eye: [
    247, 30, 29, 27, 28, 56, 190, 133, 173, 157, 158, 159, 160, 161, 246, 33,
  ],
};

export const CHEEK_GEOMETRY_VERSION = "blush-centroid-oval-v3" as const;
export const CHEEK_OVAL_SEGMENTS = 48;
export const CHEEK_OVAL_ANCHORS = {
  left_cheek: { medialApple: 330, lateralCheekbone: 346, lowerApple: 280 },
  right_cheek: { medialApple: 101, lateralCheekbone: 117, lowerApple: 50 },
} as const;
/** Equal-render mean of six exact source→Full positive-a* centroids.
 * Coefficients use anatomical axes, not fixed pixels. One fictional source;
 * this is a placement diagnostic, not human calibration.
 */
export const BLUSH_CENTROID_OFFSETS = {
  left_cheek: { major: 0.02494, minor: 0.07598 },
  right_cheek: { major: 0.01251, minor: 0.06865 },
} as const;

export function geometryVersionForRegion(
  region: Region,
  requested?: GeometryVersion,
): GeometryVersion {
  return region === "left_cheek" || region === "right_cheek"
    ? (requested ?? CHEEK_GEOMETRY_VERSION)
    : "landmark-polygon-v1";
}

/** An absent stored version is historical v1, never the current guide. */
export function storedMeasurementGeometry(
  measurement: Pick<StoredMeasurement, "geometryVersion">,
): GeometryVersion {
  return measurement.geometryVersion ?? "landmark-polygon-v1";
}
const ovalCircle = Array.from({ length: CHEEK_OVAL_SEGMENTS }, (_, index) => {
  const angle = (index * 2 * Math.PI) / CHEEK_OVAL_SEGMENTS;
  return { x: Math.cos(angle), y: Math.sin(angle) };
});

/**
 * One normalized image-space region for both guides and color sampling.
 * Cheeks use an affine oval along the medial apple→lateral cheekbone axis,
 * with its second axis from that midpoint toward the lower apple. Deriving
 * both axes from landmarks preserves image aspect, roll and mirror transforms.
 * These are cosmetic image regions, not contact or anatomical safety zones.
 */
export function regionPolygon(
  points: readonly Point[],
  region: Region,
  geometryVersion: GeometryVersion = geometryVersionForRegion(region),
): Point[] {
  if (
    ![
      "landmark-polygon-v1",
      "cheekbone-oval-v2",
      "blush-centroid-oval-v3",
    ].includes(geometryVersion)
  )
    return [];
  if (
    (region === "left_cheek" || region === "right_cheek") &&
    geometryVersion !== "landmark-polygon-v1"
  ) {
    const anchors = CHEEK_OVAL_ANCHORS[region];
    const inner = points[anchors.medialApple];
    const outer = points[anchors.lateralCheekbone];
    const apple = points[anchors.lowerApple];
    if (
      ![inner, outer, apple].every(
        (point) =>
          point && Number.isFinite(point.x) && Number.isFinite(point.y),
      )
    )
      return [];
    const anchorCenter = {
      x: (inner.x + outer.x) / 2,
      y: (inner.y + outer.y) / 2,
    };
    const major = {
      x: (outer.x - inner.x) * 0.9,
      y: (outer.y - inner.y) * 0.9,
    };
    const minor = {
      x: (apple.x - anchorCenter.x) * 0.85,
      y: (apple.y - anchorCenter.y) * 0.85,
    };
    const offsets = BLUSH_CENTROID_OFFSETS[region];
    const center =
      geometryVersion === "blush-centroid-oval-v3"
        ? {
            x:
              anchorCenter.x +
              offsets.major * major.x +
              offsets.minor * minor.x,
            y:
              anchorCenter.y +
              offsets.major * major.y +
              offsets.minor * minor.y,
          }
        : anchorCenter;
    if (Math.abs(major.x * minor.y - major.y * minor.x) < 1e-7) return [];
    const polygon = ovalCircle.map((unit) => ({
      x: center.x + major.x * unit.x + minor.x * unit.y,
      y: center.y + major.y * unit.x + minor.y * unit.y,
    }));
    return polygon.every(
      (point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1,
    )
      ? polygon
      : [];
  }
  const polygon = REGION_LANDMARKS[region].map((index) => points[index]);
  return polygon.every(
    (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y),
  )
    ? polygon.map(({ x, y }) => ({ x, y }))
    : [];
}

export const EYE_LANDMARKS = {
  left_eye: [
    263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388,
    466,
  ],
  right_eye: [
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
  ],
} as const;
export function faceEligible(points: readonly Point[]): boolean {
  if (points.length < 468) return false;
  for (let index = 0; index < 468; index++) {
    const point = points[index];
    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      (point.z !== undefined && !Number.isFinite(point.z))
    )
      return false;
  }
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
