import type { Region } from "@/lib/contracts";
import {
  EYE_LANDMARKS,
  faceEligible,
  REGION_LANDMARKS,
  type Point,
} from "./geometry";

/** Experimental image measurements; these are not physical success scores. */
export const MEASUREMENT_VERSION = 1 as const;
export const MEASUREMENT_METHOD = "linear-rgb-lab-ciede2000-v1" as const;
export type Lab = readonly [number, number, number];
type RGB = readonly [number, number, number];

export interface MeasurementFrame {
  image: Pick<ImageData, "width" | "height" | "data">;
  /** Landmarks from this exact, unmirrored image, in normalized coordinates. */
  landmarks: readonly Point[];
  eligible?: boolean;
  /** Optional external evidence. No hand detector is implied by this module. */
  occluded?: boolean;
  landmarkConfidence?: number;
}

export type MeasurementReason =
  | "invalid_image"
  | "ineligible_face"
  | "pose_changed"
  | "eye_state_changed"
  | "too_few_pixels"
  | "reference_unusable"
  | "lighting_changed"
  | "occluded"
  | "target_unavailable"
  | "target_too_subtle"
  | "appearance_mismatch";
export type MeasurementVerdict =
  "build" | "at_target" | "over" | "insufficient";
export type MeasurementSubregion =
  "inner" | "outer" | "upper" | "lower" | "left" | "right";

interface TargetPart {
  id: string;
  deltaLab: Lab;
  deltaE00: number;
  pixels: number;
}

/** Cacheable statistics derived from the actual source and preview pixels. */
export interface MeasurementTarget {
  version: typeof MEASUREMENT_VERSION;
  region: Region;
  valid: boolean;
  reason?: MeasurementReason;
  sourceLab: Lab;
  targetLab: Lab;
  deltaLab: Lab;
  deltaA: number;
  deltaE00: number;
  pixels: number;
  cells: TargetPart[];
  subregions: TargetPart[];
}

export interface MeasurementHeatmapCell {
  id: string;
  /** Normalized checkpoint-image coordinates, never display-mirrored. */
  polygon: Point[];
  progress: number;
  deltaA: number;
  deltaE00: number;
  pixels: number;
}

export interface MeasurementDiagnostics {
  method: typeof MEASUREMENT_METHOD;
  validPixels: number;
  referencePixels: number;
  heldOutPixels: number;
  gains: RGB;
  heldOutDeltaE00: number | null;
  spatialLightingDeltaE00: number | null;
  rollDifferenceDegrees: number | null;
  yawDifference: number | null;
  occlusionFraction: number | null;
}

export interface MeasurementResult {
  version: typeof MEASUREMENT_VERSION;
  region: Region;
  verdict: MeasurementVerdict;
  /** Projection onto the source→preview Lab change, clamped to 0…1.5. */
  progress: number | null;
  deltaA: number | null;
  deltaE00: number | null;
  /** Spatial consistency relative to the preview; not confidence/accuracy. */
  uniformity: number | null;
  lagging: MeasurementSubregion | null;
  reason?: MeasurementReason;
  heatmap: MeasurementHeatmapCell[];
  /** Exclude the inner mouth or eye surface when painting regional heatmaps. */
  exclusions: Point[][];
  diagnostics: MeasurementDiagnostics;
}

/** A persistence-safe summary. Images, landmarks, and overlay geometry omitted. */
export function summarizeMeasurement(result: MeasurementResult) {
  return {
    version: result.version,
    region: result.region,
    verdict: result.verdict,
    progress: result.progress,
    deltaA: result.deltaA,
    deltaE00: result.deltaE00,
    uniformity: result.uniformity,
    lagging: result.lagging,
    ...(result.reason ? { reason: result.reason } : {}),
    method: result.diagnostics.method,
    validPixels: result.diagnostics.validPixels,
    heldOutDeltaE00: result.diagnostics.heldOutDeltaE00,
    spatialLightingDeltaE00: result.diagnostics.spatialLightingDeltaE00,
  };
}

export function measurementReasonMessage(reason: MeasurementReason): string {
  const messages: Record<MeasurementReason, string> = {
    invalid_image: "This captured image could not be read. Capture again.",
    ineligible_face:
      "Face the camera with your whole face visible, then check again.",
    pose_changed:
      "Your angle changed. Return to the position of your original baseline, then check again.",
    eye_state_changed:
      "Match the eye position in your original baseline, move your hands away, then check again.",
    too_few_pixels:
      "Move a little closer so this region has enough clear detail.",
    reference_unusable:
      "Keep your forehead and nose bridge visible in steady light, then check again.",
    lighting_changed:
      "The light changed across your face. Use even light and check again.",
    occluded:
      "This region is obscured or its contrast changed sharply. Move your hands away and check again.",
    target_unavailable:
      "A comparable source and preview are needed for this region. You can still decide for yourself.",
    target_too_subtle:
      "The preview changes this region too little to measure reliably. Use your judgment.",
    appearance_mismatch:
      "The visible change differs from the preview color. Check the light and use your judgment.",
  };
  return messages[reason];
}

// These thresholds are engineering guards, not calibrated human-observer cutoffs.
const LIMITS = {
  minRegionPixels: 96,
  minReferencePixels: 48,
  minHeldOutPixels: 24,
  minCellPixels: 8,
  minTargetLab: 1.2,
  minTargetDeltaE00: 0.75,
  maxRollDegrees: 8,
  maxYawDifference: 0.075,
  maxPitchDifference: 0.08,
  maxEyeOpennessDifference: 0.1,
  maxHeldOutDeltaE00: 4.5,
  maxSpatialDeltaE00: 4.5,
  minGain: 0.55,
  maxGain: 1.8,
} as const;
const GRID = 4;
const UNITY: RGB = [1, 1, 1];
const ZERO: Lab = [0, 0, 0];

/** Forehead fit and disjoint bridge validation, above the cheek/lip areas. */
export const REFERENCE_LANDMARKS = {
  fit: [108, 151, 337, 9],
  heldOut: [193, 168, 417, 351, 197, 122],
} as const;
const INNER_MOUTH = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87,
  178, 88, 95,
] as const;

function clamp(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}
function subtract(a: Lab, b: Lab): Lab {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function magnitude(a: Lab) {
  return Math.hypot(...a);
}
function projection(actual: Lab, target: Lab) {
  const denominator = target.reduce((sum, value) => sum + value * value, 0);
  return denominator > 1e-9
    ? actual.reduce((sum, value, index) => sum + value * target[index], 0) /
        denominator
    : 0;
}

/** IEC sRGB transfer function; input channel in the 0…255 byte range. */
export function srgbChannelToLinear(channel: number): number {
  const value = clamp(channel / 255);
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** CIELAB with the sRGB D65 reference white, without adapting to D50. */
export function linearRgbToLab(rgb: RGB): Lab {
  const [r, g, b] = rgb;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const delta = 6 / 29;
  const f = (value: number) =>
    value > delta ** 3
      ? Math.cbrt(value)
      : value / (3 * delta * delta) + 4 / 29;
  const fx = f(x),
    fy = f(y),
    fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function srgbToLab(rgb: RGB): Lab {
  return linearRgbToLab(rgb.map(srgbChannelToLinear) as unknown as RGB);
}

/**
 * CIEDE2000, kL=kC=kH=1. Formula and reference cases: Sharma, Wu & Dalal,
 * https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/ (2005).
 */
export function deltaE2000(first: Lab, second: Lab): number {
  const radians = Math.PI / 180;
  const [l1, a1, b1] = first;
  const [l2, a2, b2] = second;
  const cMean = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const cPower = cMean ** 7;
  const g = (1 - Math.sqrt(cPower / (cPower + 25 ** 7))) / 2;
  const ap1 = (1 + g) * a1,
    ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1),
    cp2 = Math.hypot(ap2, b2);
  const hue = (a: number, b: number) =>
    a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / radians + 360) % 360;
  const hp1 = hue(ap1, b1),
    hp2 = hue(ap2, b2);
  const dl = l2 - l1,
    dc = cp2 - cp1;
  let dh = hp2 - hp1;
  if (cp1 * cp2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dhTerm = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * radians);
  const lp = (l1 + l2) / 2,
    cp = (cp1 + cp2) / 2;
  let hp = hp1 + hp2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(hp1 - hp2) <= 180) hp /= 2;
    else if (hp < 360) hp = (hp + 360) / 2;
    else hp = (hp - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hp - 30) * radians) +
    0.24 * Math.cos(2 * hp * radians) +
    0.32 * Math.cos((3 * hp + 6) * radians) -
    0.2 * Math.cos((4 * hp - 63) * radians);
  const sl = 1 + (0.015 * (lp - 50) ** 2) / Math.sqrt(20 + (lp - 50) ** 2);
  const sc = 1 + 0.045 * cp,
    sh = 1 + 0.015 * cp * t;
  const rt =
    -2 *
    Math.sqrt(cp ** 7 / (cp ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hp - 275) / 25) ** 2)) * radians);
  const lTerm = dl / sl,
    cTerm = dc / sc,
    hTerm = dhTerm / sh;
  return Math.sqrt(
    Math.max(
      0,
      lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rt * cTerm * hTerm,
    ),
  );
}

function landmarkPolygon(points: readonly Point[], indices: readonly number[]) {
  const polygon = indices.map((index) => points[index]);
  return polygon.every(
    (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y),
  )
    ? polygon.map(({ x, y }) => ({ x, y }))
    : [];
}

/** Display/crop geometry in the same normalized image space as detection. */
export function regionPolygon(
  points: readonly Point[],
  region: Region,
): Point[] {
  return landmarkPolygon(points, REGION_LANDMARKS[region]);
}

export function regionExclusions(
  points: readonly Point[],
  region: Region,
): Point[][] {
  if (region === "left_eye" || region === "right_eye") {
    const eye = landmarkPolygon(points, EYE_LANDMARKS[region]);
    return Math.abs(polygonArea(eye)) > 1e-7 ? [eye] : [];
  }
  if (region !== "lips") return [];
  const mouth = landmarkPolygon(points, INNER_MOUTH);
  return Math.abs(polygonArea(mouth)) > 1e-7 ? [mouth] : [];
}

export function regionCrop(
  points: readonly Point[],
  region: Region,
  padding = 0.3,
) {
  const polygon = regionPolygon(points, region);
  if (!polygon.length) return null;
  const box = bounds(polygon);
  const x = clamp(box.x - box.width * padding),
    y = clamp(box.y - box.height * padding);
  return {
    x,
    y,
    width: clamp(box.x + box.width * (1 + padding)) - x,
    height: clamp(box.y + box.height * (1 + padding)) - y,
  };
}

function polygonArea(polygon: readonly Point[]) {
  return (
    polygon.reduce((area, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function bounds(polygon: readonly Point[]) {
  const xs = polygon.map((point) => point.x),
    ys = polygon.map((point) => point.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function inside(point: Point, polygon: readonly Point[]) {
  let contained = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      contained = !contained;
  }
  return contained;
}

function edgeDistance(
  point: Point,
  polygon: readonly Point[],
  width: number,
  height: number,
) {
  let nearest = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index],
      b = polygon[(index + 1) % polygon.length];
    const dx = (b.x - a.x) * width,
      dy = (b.y - a.y) * height;
    const px = (point.x - a.x) * width,
      py = (point.y - a.y) * height;
    const length = dx * dx + dy * dy;
    const t = length ? clamp((px * dx + py * dy) / length) : 0;
    nearest = Math.min(nearest, Math.hypot(px - t * dx, py - t * dy));
  }
  return nearest;
}

interface Sample {
  x: number;
  y: number;
  rgb: RGB;
  lab: Lab;
  luminance: number;
}
interface Stats {
  pixels: number;
  linearMean: RGB;
  labMean: Lab;
  luminanceVariance: number;
}
interface Samples {
  stats: Stats;
  samples: Sample[];
  candidatePixels: number;
  validFraction: number;
  clippedFraction: number;
  box: ReturnType<typeof bounds>;
}

function statistics(samples: readonly Sample[]): Stats {
  const count = samples.length;
  if (!count)
    return { pixels: 0, linearMean: ZERO, labMean: ZERO, luminanceVariance: 0 };
  const rgb = [0, 0, 0],
    lab = [0, 0, 0];
  let luma = 0,
    lumaSquared = 0;
  for (const sample of samples) {
    for (let c = 0; c < 3; c++) {
      rgb[c] += sample.rgb[c];
      lab[c] += sample.lab[c];
    }
    luma += sample.luminance;
    lumaSquared += sample.luminance * sample.luminance;
  }
  return {
    pixels: count,
    linearMean: rgb.map((value) => value / count) as unknown as RGB,
    labMean: lab.map((value) => value / count) as unknown as Lab,
    luminanceVariance: Math.max(0, lumaSquared / count - (luma / count) ** 2),
  };
}

function samplePolygon(
  image: MeasurementFrame["image"],
  polygon: readonly Point[],
  gains: RGB = UNITY,
  exclusions: readonly Point[][] = [],
  trimHighlights = false,
): Samples {
  const box = bounds(polygon);
  const { width, height, data } = image;
  const area = box.width * width * box.height * height;
  const stride = Math.max(1, Math.ceil(Math.sqrt(area / 12_000)));
  // Distance-transform erosion: remove 5% of the shorter bounding dimension
  // from every edge (~10% overall), including the inner mouth boundary.
  const erosion = Math.min(box.width * width, box.height * height) * 0.05;
  const samples: Sample[] = [];
  let candidates = 0,
    valid = 0,
    clipped = 0;
  for (
    let y = Math.max(0, Math.floor(box.y * height));
    y < Math.min(height, Math.ceil((box.y + box.height) * height));
    y += stride
  ) {
    for (
      let x = Math.max(0, Math.floor(box.x * width));
      x < Math.min(width, Math.ceil((box.x + box.width) * width));
      x += stride
    ) {
      const point = { x: (x + 0.5) / width, y: (y + 0.5) / height };
      if (
        !inside(point, polygon) ||
        edgeDistance(point, polygon, width, height) < erosion
      )
        continue;
      if (
        exclusions.some(
          (hole) =>
            inside(point, hole) ||
            edgeDistance(point, hole, width, height) < erosion,
        )
      )
        continue;
      candidates++;
      const offset = (y * width + x) * 4;
      if (data[offset + 3] < 250) continue;
      const raw: RGB = [
        srgbChannelToLinear(data[offset]),
        srgbChannelToLinear(data[offset + 1]),
        srgbChannelToLinear(data[offset + 2]),
      ];
      const rawLuma =
        0.2126729 * raw[0] + 0.7151522 * raw[1] + 0.072175 * raw[2];
      // Black/white clipping carries no usable color evidence. Individual dark
      // channels remain valid (e.g. saturated lipstick and varied skin colors).
      if (rawLuma < 0.003 || rawLuma > 0.985) continue;
      valid++;
      const corrected = raw.map((value, channel) => value * gains[channel]);
      if (corrected.some((value) => value > 1)) clipped++;
      const rgb = corrected.map((value) => clamp(value)) as unknown as RGB;
      samples.push({
        ...point,
        rgb,
        lab: linearRgbToLab(rgb),
        luminance: 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2],
      });
    }
  }
  if (trimHighlights && samples.length) {
    samples.sort((a, b) => a.luminance - b.luminance);
    samples.length = Math.floor(samples.length * 0.95);
  }
  return {
    samples,
    stats: statistics(samples),
    candidatePixels: candidates,
    box,
    validFraction: candidates ? valid / candidates : 0,
    clippedFraction: valid ? clipped / valid : 0,
  };
}

function cellId(sample: Point, box: Samples["box"]) {
  const column = Math.floor(
    clamp((sample.x - box.x) / box.width, 0, 0.99999) * GRID,
  );
  const row = Math.floor(
    clamp((sample.y - box.y) / box.height, 0, 0.99999) * GRID,
  );
  return `${row}:${column}`;
}

function cellStatistics(samples: Samples): Map<string, Stats> {
  const groups = new Map<string, Sample[]>();
  for (const sample of samples.samples) {
    const id = cellId(sample, samples.box);
    const group = groups.get(id) ?? [];
    group.push(sample);
    groups.set(id, group);
  }
  return new Map([...groups].map(([id, group]) => [id, statistics(group)]));
}

function subregionStatistics(samples: Samples, region: Region, nose: Point) {
  const groups = new Map<string, Sample[]>();
  const middleX = samples.box.x + samples.box.width / 2;
  const middleY = samples.box.y + samples.box.height / 2;
  const noseOnLeft = nose.x < middleX;
  for (const sample of samples.samples) {
    const horizontal: MeasurementSubregion =
      region === "lips"
        ? sample.x < middleX
          ? "right"
          : "left" // anatomical sides
        : sample.x < middleX === noseOnLeft
          ? "inner"
          : "outer";
    const vertical: MeasurementSubregion =
      sample.y < middleY ? "upper" : "lower";
    for (const id of [horizontal, vertical]) {
      const group = groups.get(id) ?? [];
      group.push(sample);
      groups.set(id, group);
    }
  }
  return new Map([...groups].map(([id, group]) => [id, statistics(group)]));
}

function validImage(image: MeasurementFrame["image"]) {
  return (
    Number.isInteger(image.width) &&
    image.width > 0 &&
    Number.isInteger(image.height) &&
    image.height > 0 &&
    image.data.length >= image.width * image.height * 4
  );
}

function pose(frame: MeasurementFrame) {
  const { landmarks: points, image } = frame;
  const a = points[234],
    b = points[454],
    nose = points[1];
  const dx = (b.x - a.x) * image.width,
    dy = (b.y - a.y) * image.height;
  const width = Math.hypot(dx, dy);
  const nx = (nose.x - (a.x + b.x) / 2) * image.width;
  const ny = (nose.y - (a.y + b.y) / 2) * image.height;
  const top = points[10],
    bottom = points[152];
  return {
    roll: (Math.atan2(dy, dx) * 180) / Math.PI,
    yaw: (nx * dx + ny * dy) / (width * width),
    depthYaw:
      a.z !== undefined && b.z !== undefined
        ? ((b.z - a.z) * image.width) / width
        : 0,
    pitch: (nose.y - top.y) / (bottom.y - top.y),
    width: width / image.width,
  };
}

function emptyDiagnostics(): MeasurementDiagnostics {
  return {
    method: MEASUREMENT_METHOD,
    validPixels: 0,
    referencePixels: 0,
    heldOutPixels: 0,
    gains: UNITY,
    heldOutDeltaE00: null,
    spatialLightingDeltaE00: null,
    rollDifferenceDegrees: null,
    yawDifference: null,
    occlusionFraction: null,
  };
}

function eyeOpenness(
  frame: MeasurementFrame,
  region: "left_eye" | "right_eye",
) {
  const indices =
    region === "left_eye"
      ? [263, 362, 386, 374, 385, 380]
      : [33, 133, 159, 145, 158, 153];
  const [outer, inner, upper, lower, upper2, lower2] = indices.map(
    (index) => frame.landmarks[index],
  );
  const distance = (a: Point, b: Point) =>
    Math.hypot(
      (a.x - b.x) * frame.image.width,
      (a.y - b.y) * frame.image.height,
    );
  return (
    (distance(upper, lower) + distance(upper2, lower2)) /
    (2 * distance(outer, inner))
  );
}

interface PairAnalysis {
  reason?: MeasurementReason;
  diagnostics: MeasurementDiagnostics;
  before?: Samples;
  after?: Samples;
}

function analyzePair(
  before: MeasurementFrame,
  after: MeasurementFrame,
  region: Region,
): PairAnalysis {
  const diagnostics = emptyDiagnostics();
  const stop = (reason: MeasurementReason): PairAnalysis => ({
    reason,
    diagnostics,
  });
  if (!validImage(before.image) || !validImage(after.image))
    return stop("invalid_image");
  if (
    before.eligible === false ||
    after.eligible === false ||
    !faceEligible(before.landmarks) ||
    !faceEligible(after.landmarks) ||
    (before.landmarkConfidence !== undefined &&
      before.landmarkConfidence < 0.6) ||
    (after.landmarkConfidence !== undefined && after.landmarkConfidence < 0.6)
  )
    return stop("ineligible_face");
  if (before.occluded || after.occluded) return stop("occluded");
  const a = pose(before),
    b = pose(after);
  const roll = Math.abs(((b.roll - a.roll + 540) % 360) - 180);
  const yaw = Math.max(
    Math.abs(b.yaw - a.yaw),
    Math.abs(b.depthYaw - a.depthYaw) / 2,
  );
  diagnostics.rollDifferenceDegrees = roll;
  diagnostics.yawDifference = yaw;
  if (
    roll > LIMITS.maxRollDegrees ||
    yaw > LIMITS.maxYawDifference ||
    Math.abs(b.pitch - a.pitch) > LIMITS.maxPitchDifference ||
    b.width / a.width < 0.7 ||
    b.width / a.width > 1.45 ||
    Math.abs(
      before.image.width / before.image.height -
        after.image.width / after.image.height,
    ) > 0.02
  )
    return stop("pose_changed");
  if (region === "left_eye" || region === "right_eye") {
    const beforeOpen = eyeOpenness(before, region),
      afterOpen = eyeOpenness(after, region);
    if (!Number.isFinite(beforeOpen) || !Number.isFinite(afterOpen))
      return stop("ineligible_face");
    if (Math.abs(beforeOpen - afterOpen) > LIMITS.maxEyeOpennessDifference)
      return stop("eye_state_changed");
  }

  const fitBefore = samplePolygon(
    before.image,
    landmarkPolygon(before.landmarks, REFERENCE_LANDMARKS.fit),
    UNITY,
    [],
    true,
  );
  const fitAfterRaw = samplePolygon(
    after.image,
    landmarkPolygon(after.landmarks, REFERENCE_LANDMARKS.fit),
    UNITY,
    [],
    true,
  );
  diagnostics.referencePixels = Math.min(
    fitBefore.stats.pixels,
    fitAfterRaw.stats.pixels,
  );
  if (
    diagnostics.referencePixels < LIMITS.minReferencePixels ||
    fitBefore.validFraction < 0.8 ||
    fitAfterRaw.validFraction < 0.8 ||
    fitBefore.stats.linearMean.some((value) => value < 0.008) ||
    fitAfterRaw.stats.linearMean.some((value) => value < 0.008)
  )
    return stop("reference_unusable");
  const gains = fitBefore.stats.linearMean.map(
    (value, channel) => value / fitAfterRaw.stats.linearMean[channel],
  ) as unknown as RGB;
  diagnostics.gains = gains;
  if (gains.some((value) => value < LIMITS.minGain || value > LIMITS.maxGain))
    return stop("lighting_changed");

  const heldBefore = samplePolygon(
    before.image,
    landmarkPolygon(before.landmarks, REFERENCE_LANDMARKS.heldOut),
    UNITY,
    [],
    true,
  );
  const heldAfter = samplePolygon(
    after.image,
    landmarkPolygon(after.landmarks, REFERENCE_LANDMARKS.heldOut),
    gains,
    [],
    true,
  );
  diagnostics.heldOutPixels = Math.min(
    heldBefore.stats.pixels,
    heldAfter.stats.pixels,
  );
  if (
    diagnostics.heldOutPixels < LIMITS.minHeldOutPixels ||
    heldBefore.validFraction < 0.8 ||
    heldAfter.validFraction < 0.8
  )
    return stop("reference_unusable");
  // This patch was NOT used to fit gains. Its residual is meaningful, unlike
  // comparing the same three fitted channel means against themselves.
  diagnostics.heldOutDeltaE00 = deltaE2000(
    heldBefore.stats.labMean,
    heldAfter.stats.labMean,
  );
  const fitAfter = samplePolygon(
    after.image,
    landmarkPolygon(after.landmarks, REFERENCE_LANDMARKS.fit),
    gains,
    [],
    true,
  );
  const beforeCells = cellStatistics(fitBefore),
    afterCells = cellStatistics(fitAfter);
  let spatialResidual = 0;
  for (const [id, cellBefore] of beforeCells) {
    const cellAfter = afterCells.get(id);
    if (
      cellAfter &&
      Math.min(cellBefore.pixels, cellAfter.pixels) >= LIMITS.minCellPixels
    ) {
      spatialResidual = Math.max(
        spatialResidual,
        deltaE2000(cellBefore.labMean, cellAfter.labMean),
      );
    }
  }
  diagnostics.spatialLightingDeltaE00 = spatialResidual;
  if (
    diagnostics.heldOutDeltaE00 > LIMITS.maxHeldOutDeltaE00 ||
    spatialResidual > LIMITS.maxSpatialDeltaE00 ||
    heldAfter.clippedFraction > 0.1
  )
    return stop("lighting_changed");

  const regionBefore = samplePolygon(
    before.image,
    regionPolygon(before.landmarks, region),
    UNITY,
    regionExclusions(before.landmarks, region),
  );
  const regionAfter = samplePolygon(
    after.image,
    regionPolygon(after.landmarks, region),
    gains,
    regionExclusions(after.landmarks, region),
  );
  diagnostics.validPixels = Math.min(
    regionBefore.stats.pixels,
    regionAfter.stats.pixels,
  );
  diagnostics.occlusionFraction = Math.max(
    0,
    regionBefore.validFraction - regionAfter.validFraction,
  );
  if (diagnostics.validPixels < LIMITS.minRegionPixels)
    return stop("too_few_pixels");
  if (
    regionBefore.validFraction < 0.8 ||
    regionAfter.validFraction < 0.8 ||
    diagnostics.occlusionFraction > 0.12 ||
    regionAfter.stats.luminanceVariance >
      regionBefore.stats.luminanceVariance * 4 + 0.01
  )
    return stop("occluded");
  if (regionAfter.clippedFraction > 0.1) return stop("lighting_changed");
  return { diagnostics, before: regionBefore, after: regionAfter };
}

function targetParts(
  before: Map<string, Stats>,
  after: Map<string, Stats>,
): TargetPart[] {
  const parts: TargetPart[] = [];
  for (const [id, first] of before) {
    const second = after.get(id);
    if (!second || Math.min(first.pixels, second.pixels) < LIMITS.minCellPixels)
      continue;
    parts.push({
      id,
      deltaLab: subtract(second.labMean, first.labMean),
      deltaE00: deltaE2000(first.labMean, second.labMean),
      pixels: Math.min(first.pixels, second.pixels),
    });
  }
  return parts;
}

/**
 * YouCam outputs must be pixel-aligned to their source. Detect the source once;
 * use those same normalized landmarks for both images, even if the caller has
 * independently detected the preview. Aspect-ratio changes are rejected.
 */
export function createMeasurementTarget(
  source: MeasurementFrame,
  preview: MeasurementFrame,
  region: Region,
): MeasurementTarget {
  const comparison = analyzePair(
    source,
    { ...preview, landmarks: source.landmarks },
    region,
  );
  const target: MeasurementTarget = {
    version: MEASUREMENT_VERSION,
    region,
    valid: false,
    sourceLab: ZERO,
    targetLab: ZERO,
    deltaLab: ZERO,
    deltaA: 0,
    deltaE00: 0,
    pixels: 0,
    cells: [],
    subregions: [],
  };
  if (comparison.reason || !comparison.before || !comparison.after) {
    target.reason = comparison.reason ?? "target_unavailable";
    return target;
  }
  const { before, after } = comparison;
  target.sourceLab = before.stats.labMean;
  target.targetLab = after.stats.labMean;
  target.deltaLab = subtract(target.targetLab, target.sourceLab);
  target.deltaA = target.deltaLab[1];
  target.deltaE00 = deltaE2000(target.sourceLab, target.targetLab);
  target.pixels = Math.min(before.stats.pixels, after.stats.pixels);
  target.cells = targetParts(cellStatistics(before), cellStatistics(after));
  target.subregions = targetParts(
    subregionStatistics(before, region, source.landmarks[1]),
    subregionStatistics(after, region, source.landmarks[1]),
  );
  if (
    magnitude(target.deltaLab) < LIMITS.minTargetLab ||
    target.deltaE00 < LIMITS.minTargetDeltaE00
  ) {
    target.reason = "target_too_subtle";
    return target;
  }
  target.valid = true;
  return target;
}

// Clip a heatmap tile to the region, so no tile paints outside its boundary.
function clipTile(
  polygon: Point[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  let result = polygon;
  const edges: ["x" | "y", number, boolean][] = [
    ["x", x, true],
    ["x", x + width, false],
    ["y", y, true],
    ["y", y + height, false],
  ];
  for (const [axis, bound, greater] of edges) {
    const input = result;
    result = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i],
        b = input[(i + 1) % input.length];
      const aInside = greater ? a[axis] >= bound : a[axis] <= bound;
      const bInside = greater ? b[axis] >= bound : b[axis] <= bound;
      if (aInside) result.push(a);
      if (aInside !== bInside) {
        const ratio = (bound - a[axis]) / (b[axis] - a[axis]);
        result.push({
          x: a.x + ratio * (b.x - a.x),
          y: a.y + ratio * (b.y - a.y),
        });
      }
    }
  }
  return result;
}

export function measureCheckpoint({
  baseline,
  checkpoint,
  target,
}: {
  baseline: MeasurementFrame;
  checkpoint: MeasurementFrame;
  target: MeasurementTarget;
}): MeasurementResult {
  const result: MeasurementResult = {
    version: MEASUREMENT_VERSION,
    region: target.region,
    verdict: "insufficient",
    progress: null,
    deltaA: null,
    deltaE00: null,
    uniformity: null,
    lagging: null,
    heatmap: [],
    exclusions: [],
    diagnostics: emptyDiagnostics(),
  };
  if (
    !target.valid ||
    target.version !== MEASUREMENT_VERSION ||
    !target.deltaLab.every(Number.isFinite) ||
    !Number.isFinite(target.deltaE00)
  ) {
    result.reason =
      target.reason === "target_too_subtle"
        ? "target_too_subtle"
        : "target_unavailable";
    return result;
  }
  if (
    magnitude(target.deltaLab) < LIMITS.minTargetLab ||
    target.deltaE00 < LIMITS.minTargetDeltaE00
  ) {
    result.reason = "target_too_subtle";
    return result;
  }
  const comparison = analyzePair(baseline, checkpoint, target.region);
  result.diagnostics = comparison.diagnostics;
  if (comparison.reason || !comparison.before || !comparison.after) {
    result.reason = comparison.reason ?? "too_few_pixels";
    return result;
  }
  const { before, after } = comparison;
  const delta = subtract(after.stats.labMean, before.stats.labMean);
  const rawProgress = projection(delta, target.deltaLab);
  const residual = Math.hypot(
    ...delta.map(
      (value, channel) => value - rawProgress * target.deltaLab[channel],
    ),
  );
  if (residual > Math.max(8, magnitude(target.deltaLab) * 1.25)) {
    result.reason = "appearance_mismatch";
    return result;
  }
  result.progress = clamp(rawProgress, 0, 1.5);
  result.deltaA = delta[1];
  result.deltaE00 = deltaE2000(before.stats.labMean, after.stats.labMean);
  result.verdict =
    result.progress < 0.85
      ? "build"
      : result.progress > 1.15
        ? "over"
        : "at_target";
  const cells = targetParts(cellStatistics(before), cellStatistics(after));
  const polygon = regionPolygon(checkpoint.landmarks, target.region);
  for (const cell of cells) {
    const desired = target.cells.find((part) => part.id === cell.id);
    if (!desired || magnitude(desired.deltaLab) < LIMITS.minTargetLab) continue;
    const [row, column] = cell.id.split(":").map(Number);
    const tile = clipTile(
      polygon,
      after.box.x + (column * after.box.width) / GRID,
      after.box.y + (row * after.box.height) / GRID,
      after.box.width / GRID,
      after.box.height / GRID,
    );
    result.heatmap.push({
      id: cell.id,
      polygon: tile,
      progress: clamp(projection(cell.deltaLab, desired.deltaLab), 0, 1.5),
      deltaA: cell.deltaLab[1],
      deltaE00: cell.deltaE00,
      pixels: cell.pixels,
    });
  }
  result.exclusions = regionExclusions(checkpoint.landmarks, target.region);
  const weight = result.heatmap.reduce((total, cell) => total + cell.pixels, 0);
  if (!weight) {
    // A region mean alone cannot supply the spatial consistency required by a
    // measured checkpoint. Return an abstention rather than a partial score.
    result.verdict = "insufficient";
    result.reason = "too_few_pixels";
    result.progress = null;
    result.deltaA = null;
    result.deltaE00 = null;
    return result;
  }
  if (weight) {
    const mean =
      result.heatmap.reduce(
        (sum, cell) => sum + cell.progress * cell.pixels,
        0,
      ) / weight;
    const variance =
      result.heatmap.reduce(
        (sum, cell) => sum + (cell.progress - mean) ** 2 * cell.pixels,
        0,
      ) / weight;
    result.uniformity = clamp(1 - Math.sqrt(variance) / Math.max(0.25, mean));
  }
  const subregions = targetParts(
    subregionStatistics(before, target.region, baseline.landmarks[1]),
    subregionStatistics(after, target.region, checkpoint.landmarks[1]),
  ).flatMap((part) => {
    const desired = target.subregions.find((entry) => entry.id === part.id);
    return desired && magnitude(desired.deltaLab) >= LIMITS.minTargetLab
      ? [
          {
            id: part.id as MeasurementSubregion,
            progress: clamp(
              projection(part.deltaLab, desired.deltaLab),
              0,
              1.5,
            ),
          },
        ]
      : [];
  });
  subregions.sort((a, b) => a.progress - b.progress);
  if (
    subregions.length &&
    subregions.at(-1)!.progress - subregions[0].progress >= 0.12
  ) {
    result.lagging = subregions[0].id;
  }
  return result;
}
