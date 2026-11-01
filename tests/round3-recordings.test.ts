import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { EYE_SAMPLE_SETUP, SAMPLE_SETUP } from "@/lib/catalog";
import type { StoredMeasurement } from "@/lib/contracts";
import { createSession } from "@/lib/planner";
import { attachRecordedSamplePreviews } from "@/lib/server/recorded-previews";
import {
  makeRecipe,
  makeRound2EyeRecipe,
  validateEffects,
} from "@/lib/youcam/recipes";
import { RecordedRound3ManifestSchema } from "@/lib/youcam/round3-recorded";
import { RECORDED_ROUND3_MANIFEST_SHA256 } from "@/lib/youcam/round3-integrity";
import {
  sampleCheckpointForPlan,
  sampleCheckpointForHistory,
} from "@/lib/youcam/sample-checkpoints";
import { round2CheckpointAssetId } from "@/lib/youcam/round2-recorded";
import {
  createMeasurementTarget,
  measureCheckpoint,
  type MeasurementFrame,
} from "@/lib/vision/measure";
import { belowEyePatch, inside } from "./support/below-eye-audit";
import raw from "../public/examples/recorded-round3.json";
import r2 from "../public/examples/recorded-round2.json";
import legacy from "../public/examples/recorded-samples.json";
import fixture from "./fixtures/sample-landmarks.json";
const manifest = RecordedRound3ManifestSchema.parse(raw),
  cache = new Map<string, Promise<MeasurementFrame>>();
function load(url: string): Promise<MeasurementFrame> {
  let pending = cache.get(url);
  if (!pending) {
    pending = sharp(`public${url}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({
        image: {
          data: new Uint8ClampedArray(data),
          width: info.width,
          height: info.height,
        },
        landmarks: fixture.points,
      }));
    cache.set(url, pending);
  }
  return pending;
}
const full = manifest.records.find((record) => record.level === "full")!,
  light = manifest.records.find((record) => record.level === "light")!;
async function ready(lookId: "eyes" | "rose" = "eyes") {
  const session = createSession(
    structuredClone(lookId === "eyes" ? EYE_SAMPLE_SETUP : SAMPLE_SETUP),
    "round3-compat",
  );
  session.sourceAssetId = manifest.source.assetId;
  session.assets.push({
    id: manifest.source.assetId,
    url: manifest.source.url,
    provenance: "synthetic_inspiration",
    purpose: "baseline",
    width: 1024,
    height: 1280,
    createdAt: session.createdAt,
  });
  await attachRecordedSamplePreviews(session);
  return session;
}
function stored(
  targetAssetId: string,
  sampleCheckpointId?: string,
): StoredMeasurement {
  return {
    version: 1,
    geometryVersion: "landmark-polygon-v1",
    region: "left_eye",
    verdict: "build",
    progress: 0.4,
    deltaA: 0,
    deltaE00: 2,
    uniformity: 1,
    lagging: null,
    provenance: "simulated",
    reportedPass: false,
    targetLevel: "full",
    targetAssetId,
    elapsedMs: 0,
    ...(sampleCheckpointId ? { sampleCheckpointId } : {}),
  };
}
describe("approved R3 pair with unchanged lid masks and guards", () => {
  it("pins source, approved output bytes, exact current and frozen R2 recipes", () => {
    const hash = (path: string) =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(RECORDED_ROUND3_MANIFEST_SHA256).toBe(
      "b7bc1b755bb7f36f012eea7b5e1b536ae1b2156a55701c0be50cdd0dd45f5342",
    );
    expect(hash("public/examples/recorded-round3.json")).toBe(
      RECORDED_ROUND3_MANIFEST_SHA256,
    );
    expect(hash(`public${manifest.source.url}`)).toBe(fixture.source.sha256);
    for (const record of manifest.records) {
      expect(hash(`public${record.output.url}`)).toBe(record.output.sha256);
      expect(record.recipe).toEqual(
        makeRecipe("eyes", "shadow", false, record.intensity),
      );
      expect(record.attempts).toBe(1);
    }
    for (const record of r2.records.filter(
      (item) => item.purpose === "shadow_target",
    ))
      expect(record.recipe).toEqual(
        makeRound2EyeRecipe("shadow", record.intensity as 25 | 45),
      );
  });
  it.each(["left_eye", "right_eye"] as const)(
    "measures Light→Full pixels on %s at the original lid resolution",
    async (region) => {
      const baseline = await load(manifest.source.url),
        fullFrame = await load(full.output.url),
        lightFrame = await load(light.output.url),
        target = createMeasurementTarget(baseline, fullFrame, region),
        lightTarget = createMeasurementTarget(baseline, lightFrame, region);
      expect(target.valid, target.reason).toBe(true);
      expect(lightTarget.valid, lightTarget.reason).toBe(true);
      expect(target.deltaE00).toBeGreaterThan(4);
      expect(target.deltaE00).toBeLessThan(5);
      expect(target.pixels).toBe(region === "left_eye" ? 1395 : 1505);
      expect(target.geometryVersion).toBe("landmark-polygon-v1");
      const first = measureCheckpoint({
        baseline,
        checkpoint: lightFrame,
        target,
      });
      expect(first.verdict, first.reason).toBe("build");
      expect(first.progress).toBeGreaterThan(0.4);
      expect(first.progress).toBeLessThan(0.7);
      expect(first.heatmap.length).toBeGreaterThan(0);
      const self = measureCheckpoint({
        baseline,
        checkpoint: fullFrame,
        target,
      });
      expect(self.verdict, self.reason).toBe("at_target");
      expect(Math.abs(self.progress! - 1)).toBeLessThanOrEqual(0.15);
    },
  );
  it.each(["light", "full"] as const)(
    "keeps every fixed below-eye RGB pixel unchanged for %s",
    async (level) => {
      const source = await load(manifest.source.url),
        frame = await load(
          manifest.records.find((item) => item.level === level)!.output.url,
        );
      for (const region of ["left_eye", "right_eye"] as const) {
        const polygon = belowEyePatch(region);
        let pixels = 0,
          changed = 0;
        for (
          let y = Math.floor(Math.min(...polygon.map((p) => p.y)));
          y < Math.ceil(Math.max(...polygon.map((p) => p.y)));
          y++
        )
          for (
            let x = Math.floor(Math.min(...polygon.map((p) => p.x)));
            x < Math.ceil(Math.max(...polygon.map((p) => p.x)));
            x++
          ) {
            if (!inside({ x: x + 0.5, y: y + 0.5 }, polygon)) continue;
            const at = (y * source.image.width + x) * 4;
            if (
              [0, 1, 2].some(
                (c) => source.image.data[at + c] !== frame.image.data[at + c],
              )
            )
              changed++;
            pixels++;
          }
        expect(pixels).toBe(region === "left_eye" ? 1150 : 1103);
        expect(changed).toBe(0);
      }
    },
  );
  it("binds fresh shadow plans to the exact approved pair", async () => {
    const session = createSession(
      structuredClone(EYE_SAMPLE_SETUP),
      "round3-catalog",
    );
    session.sourceAssetId = manifest.source.assetId;
    session.assets.push({
      id: manifest.source.assetId,
      url: manifest.source.url,
      provenance: "synthetic_inspiration",
      purpose: "baseline",
      width: 1024,
      height: 1280,
      createdAt: session.createdAt,
    });
    await attachRecordedSamplePreviews(session);
    const shadow = session.candidates.find(
      (plan) => plan.routeId === "shadow",
    )!;
    expect(shadow.previewAsset?.url).toBe(full.output.url);
    expect(shadow.previewVariants?.map((variant) => variant.intensity)).toEqual(
      [35, 65],
    );
    expect(sampleCheckpointForPlan(session, shadow)).toEqual({
      url: light.output.url,
      sha256: light.output.sha256,
    });
  });
  it("retains original registered Light pixels when old assets lack recorded timestamps", async () => {
    const session = await ready();
    const plan = session.candidates.find((item) => item.routeId === "liner")!;
    const before = JSON.stringify(plan.recipe);
    delete plan.previewAsset!.recordedAt;
    for (const asset of session.assets) delete asset.recordedAt;
    expect(sampleCheckpointForPlan(session, plan)).toEqual({
      url: "/examples/eyes/liner-light.png",
    });
    expect(
      sampleCheckpointForHistory(
        session,
        stored(plan.previewAsset!.id),
        plan.previewAsset!,
      ),
    ).toEqual({ url: "/examples/eyes/liner-light.png" });
    expect(JSON.stringify(plan.recipe)).toBe(before);
  });
  it("measures a genuine first pass for the old nine-preview catalog without rewriting its target", async () => {
    const session = await ready("rose"),
      plan = session.candidates.find((item) => item.routeId === "tap")!;
    const old = legacy.records.find(
      (item) => item.lookId === "rose" && item.routeId === "tap",
    )!;
    plan.recipe = validateEffects(old.recipe);
    plan.previewAsset = {
      id: "old-tap-target",
      url: old.output.url,
      provenance: "virtual_preview",
      purpose: "preview",
      createdAt: old.generatedAt,
      width: 1024,
      height: 1280,
    };
    session.assets = session.assets.filter(
      (asset) => !asset.id.startsWith("sample-checkpoint-"),
    );
    session.assets.push(plan.previewAsset);
    const before = JSON.stringify(plan),
      frame = sampleCheckpointForPlan(session, plan)!;
    expect(frame.url).toBe("/examples/round2/blush-rose-satin.png");
    expect(frame.sha256).toBe(
      r2.records.find((record) => record.id === "blush-rose-satin")!.output
        .sha256,
    );
    expect(
      sampleCheckpointForHistory(
        session,
        stored(plan.previewAsset.id, frame.sha256),
        plan.previewAsset,
      ),
    ).toEqual(frame);
    expect(JSON.stringify(plan)).toBe(before);
  });
  it("does not replace a missing modern R3 frame with another recording", async () => {
    const session = await ready(),
      plan = session.candidates.find((item) => item.routeId === "shadow")!;
    session.assets = session.assets.filter(
      (asset) => asset.id !== round2CheckpointAssetId(light.output.sha256),
    );
    expect(sampleCheckpointForPlan(session, plan)).toBeUndefined();
    expect(
      sampleCheckpointForHistory(
        session,
        stored(plan.previewAsset!.id, light.output.sha256),
        plan.previewAsset!,
      ),
    ).toBeUndefined();
  });
});
