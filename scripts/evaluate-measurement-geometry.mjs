/** Offline diagnostic only; one fictional source, no provider calls or human calibration. */
import crypto from "node:crypto";
import {
  createMeasurementTarget,
  measureCheckpoint,
} from "../src/lib/vision/measure.ts";
import fs from "node:fs/promises";
import sharp from "sharp";
import {
  deltaACentroid,
  cheekCentroidBounds,
} from "../src/lib/vision/delta-a-centroid.ts";
import {
  CHEEK_OVAL_ANCHORS,
  regionPolygon,
  CHEEK_GEOMETRY_VERSION,
  BLUSH_CENTROID_OFFSETS,
} from "../src/lib/vision/geometry.ts";
const fixture = JSON.parse(
  await fs.readFile("tests/fixtures/sample-landmarks.json", "utf8"),
);
const points = fixture.points,
  ladder = JSON.parse(
    await fs.readFile("public/examples/recorded-ladders.json", "utf8"),
  );
const cache = new Map();
async function load(url) {
  if (!cache.has(url))
    cache.set(
      url,
      (async () => {
        const bytes = await fs.readFile("public" + url);
        const { data, info } = await sharp(bytes)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        return {
          data: new Uint8ClampedArray(data),
          width: info.width,
          height: info.height,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        };
      })(),
    );
  return cache.get(url);
}
const source = await load(ladder.source.url),
  rows = [];
if (source.sha256 !== fixture.source.sha256) throw new Error("Source changed");
for (const record of ladder.records.filter((r) => r.level === "full")) {
  const target = await load(record.output.url);
  if (target.sha256 !== record.output.sha256)
    throw new Error("Full output changed");
  for (const region of ["left_cheek", "right_cheek"]) {
    const bounds = cheekCentroidBounds(points, region),
      centroid = deltaACentroid(source, target, bounds),
      all = deltaACentroid(source, target, {
        left: region === "left_cheek" ? points[1].x : 0,
        right: region === "left_cheek" ? 1 : points[1].x,
        top: 0,
        bottom: 1,
      });
    const anchors = CHEEK_OVAL_ANCHORS[region],
      inner = points[anchors.medialApple],
      outer = points[anchors.lateralCheekbone],
      apple = points[anchors.lowerApple],
      center = { x: (inner.x + outer.x) / 2, y: (inner.y + outer.y) / 2 },
      major = { x: 0.9 * (outer.x - inner.x), y: 0.9 * (outer.y - inner.y) },
      minor = {
        x: 0.85 * (apple.x - center.x),
        y: 0.85 * (apple.y - center.y),
      },
      dx = centroid.point.x - center.x,
      dy = centroid.point.y - center.y,
      det = major.x * minor.y - major.y * minor.x;
    const polygon = regionPolygon(points, region),
      newCenter = {
        x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length,
        y: polygon.reduce((s, p) => s + p.y, 0) / polygon.length,
      };
    rows.push({
      newCenter,
      newCenterErrorPixels: Math.hypot(
        (newCenter.x - centroid.point.x) * source.width,
        (newCenter.y - centroid.point.y) * source.height,
      ),
      lookId: record.lookId,
      texture: record.texture,
      region,
      outputSha256: record.output.sha256,
      bounds,
      ...centroid,
      allImageHalfCentroid: all.point,
      fractionMassInsideROI:
        centroid.positiveDeltaAMass / all.positiveDeltaAMass,
      v2Center: center,
      shiftPixels: { x: dx * source.width, y: dy * source.height },
      axisOffsets: {
        major: (dx * minor.y - dy * minor.x) / det,
        minor: (major.x * dy - major.y * dx) / det,
      },
    });
  }
}
const centers = {};
for (const region of ["left_cheek", "right_cheek"]) {
  const selected = rows.filter((r) => r.region === region);
  centers[region] = {
    meanCentroid: {
      x: selected.reduce((s, r) => s + r.point.x, 0) / 6,
      y: selected.reduce((s, r) => s + r.point.y, 0) / 6,
    },
    axisOffsets: {
      major: selected.reduce((s, r) => s + r.axisOffsets.major, 0) / 6,
      minor: selected.reduce((s, r) => s + r.axisOffsets.minor, 0) / 6,
    },
  };
}
const bands = [];
for (const full of ladder.records.filter((r) => r.level === "full"))
  for (const region of ["left_cheek", "right_cheek"]) {
    const baseline = { image: source, landmarks: points },
      target = createMeasurementTarget(
        baseline,
        { image: await load(full.output.url), landmarks: points },
        region,
      );
    for (const level of ["light", "build", "full"]) {
      const frame = ladder.records.find(
        (r) =>
          r.lookId === full.lookId &&
          r.texture === full.texture &&
          r.level === level,
      );
      const measured = measureCheckpoint({
        baseline,
        checkpoint: { image: await load(frame.output.url), landmarks: points },
        target,
      });
      bands.push({
        lookId: full.lookId,
        texture: full.texture,
        region,
        level,
        progress: measured.progress,
        verdict: measured.verdict,
        reason: measured.reason ?? null,
      });
    }
  }
const report = {
  geometryVersion: CHEEK_GEOMETRY_VERSION,
  adoptedOffsets: BLUSH_CENTROID_OFFSETS,
  bands,
  observedAt: new Date().toISOString(),
  source: fixture.source,
  method:
    "Positive CIELAB a* change, independent broad anatomical ROI, checked against all-image-half mass; equal-weight mean of six full-render centroids mapped to landmark axes.",
  providerRequests: 0,
  rows,
  centers,
};
await fs.writeFile(
  "docs/evidence/measurement-centroid-r3.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    output: "docs/evidence/measurement-centroid-r3.json",
    rows: rows.length,
    comparisons: bands.length,
    maxCentroidErrorPixels: Math.max(
      ...rows.map((row) => row.newCenterErrorPixels),
    ),
    providerRequests: 0,
  }),
);
