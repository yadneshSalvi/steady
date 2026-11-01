import sharp from "sharp";
import { describe, it, expect } from "vitest";
import {
  deltaACentroid,
  cheekCentroidBounds,
} from "@/lib/vision/delta-a-centroid";
import {
  regionPolygon,
  storedMeasurementGeometry,
} from "@/lib/vision/geometry";
import type { MeasurementFrame } from "@/lib/vision/measure";
import manifest from "../public/examples/recorded-ladders.json";
import fixture from "./fixtures/sample-landmarks.json";
const cache = new Map<string, Promise<MeasurementFrame["image"]>>();
function load(url: string) {
  let pending = cache.get(url);
  if (!pending) {
    pending = sharp(`public${url}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({
        data: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
      }));
    cache.set(url, pending);
  }
  return pending;
}
function image() {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < 64; i++) data.set([100, 90, 80, 255], i * 4);
  return { data, width: 8, height: 8 };
}
describe("independent positive-a* placement diagnostic", () => {
  it("recovers equal positive-change pixel centers and excludes a greenward change", () => {
    const source = image(),
      target = image();
    target.data.set([150, 80, 90, 255], (1 * 8 + 1) * 4);
    target.data.set([150, 80, 90, 255], (2 * 8 + 6) * 4);
    target.data.set([70, 130, 70, 255], (7 * 8 + 4) * 4);
    const measured = deltaACentroid(source, target, {
      left: 0,
      right: 1,
      top: 0,
      bottom: 1,
    })!;
    expect(measured.pixels).toBe(2);
    expect(measured.point.x).toBeCloseTo(0.5, 12);
    expect(measured.point.y).toBeCloseTo(0.25, 12);
    const left = deltaACentroid(source, target, {
      left: 0,
      right: 0.5,
      top: 0,
      bottom: 1,
    })!;
    expect(left.pixels).toBe(1);
    expect(left.point).toEqual({ x: 1.5 / 8, y: 1.5 / 8 });
  });
  it("returns no fabricated center for unchanged, invalid or transparent evidence", () => {
    const source = image(),
      target = image(),
      roi = { left: 0, right: 1, top: 0, bottom: 1 };
    expect(deltaACentroid(source, target, roi)).toBeNull();
    target.data.set([150, 80, 90, 0], 0);
    expect(deltaACentroid(source, target, roi)).toBeNull();
    expect(deltaACentroid(source, { ...target, width: 9 }, roi)).toBeNull();
    expect(deltaACentroid(source, target, { ...roi, left: NaN })).toBeNull();
    expect(cheekCentroidBounds([], "left_cheek")).toBeNull();
  });
  it("resolves stored missing scope to v1 and retains explicit v2/v3", () => {
    expect(storedMeasurementGeometry({})).toBe("landmark-polygon-v1");
    expect(
      storedMeasurementGeometry({ geometryVersion: "cheekbone-oval-v2" }),
    ).toBe("cheekbone-oval-v2");
    expect(
      storedMeasurementGeometry({ geometryVersion: "blush-centroid-oval-v3" }),
    ).toBe("blush-centroid-oval-v3");
  });
  it.each(
    manifest.records
      .filter((r) => r.level === "full")
      .flatMap((record) =>
        (["left_cheek", "right_cheek"] as const).map((region) => ({
          record,
          region,
          label: `${record.lookId}/${record.texture}/${region}`,
        })),
      ),
  )(
    "centers the current oval on actual source→Full a* mass for $label",
    async ({ record, region }) => {
      const source = await load(manifest.source.url),
        target = await load(record.output.url),
        bounds = cheekCentroidBounds(fixture.points, region)!,
        centroid = deltaACentroid(source, target, bounds)!,
        poly = regionPolygon(fixture.points, region),
        old = regionPolygon(fixture.points, region, "cheekbone-oval-v2");
      const center = (p: typeof poly) => ({
        x: p.reduce((s, v) => s + v.x, 0) / p.length,
        y: p.reduce((s, v) => s + v.y, 0) / p.length,
      });
      const current = center(poly),
        prior = center(old);
      expect(
        Math.hypot(
          (current.x - centroid.point.x) * 1024,
          (current.y - centroid.point.y) * 1280,
        ),
      ).toBeLessThan(2);
      expect(current.y).toBeGreaterThan(prior.y);
      expect(
        region === "left_cheek" ? current.x > prior.x : current.x < prior.x,
      ).toBe(true);
      const all = deltaACentroid(source, target, {
        left: region === "left_cheek" ? fixture.points[1].x : 0,
        right: region === "left_cheek" ? 1 : fixture.points[1].x,
        top: 0,
        bottom: 1,
      })!;
      expect(
        centroid.positiveDeltaAMass / all.positiveDeltaAMass,
      ).toBeGreaterThan(0.95);
    },
  );
});
