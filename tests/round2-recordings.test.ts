import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { EYE_SAMPLE_SETUP, SAMPLE_SETUP } from "@/lib/catalog";
import type { LookId, StoredMeasurement, StudioSession } from "@/lib/contracts";
import { createSession } from "@/lib/planner";
import { attachRecordedSamplePreviews } from "@/lib/server/recorded-previews";
import {
  makeLegacyEyeRecipe,
  selectPreviewLevel,
  validateEffects,
} from "@/lib/youcam/recipes";
import { RECORDED_ROUND2_MANIFEST_SHA256 } from "@/lib/youcam/round2-integrity";
import {
  RecordedRound2ManifestSchema,
  round2CheckpointAssetId,
} from "@/lib/youcam/round2-recorded";
import {
  sampleCheckpointForHistory,
  sampleCheckpointForPlan,
} from "@/lib/youcam/sample-checkpoints";
import rawManifest from "../public/examples/recorded-round2.json";

const manifest = RecordedRound2ManifestSchema.parse(rawManifest);
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
async function sample(lookId: LookId = "rose") {
  const session = createSession(
    {
      ...structuredClone(lookId === "eyes" ? EYE_SAMPLE_SETUP : SAMPLE_SETUP),
      lookId,
    },
    `round2-${lookId}`,
  );
  session.sourceAssetId = manifest.source.assetId;
  session.assets.push({
    id: manifest.source.assetId,
    url: manifest.source.url,
    provenance: "synthetic_inspiration",
    purpose: "baseline",
    createdAt: session.createdAt,
    width: 1024,
    height: 1280,
  });
  await attachRecordedSamplePreviews(session);
  return session;
}
function observation(
  targetAssetId: string,
  sampleCheckpointId?: string,
): StoredMeasurement {
  return {
    version: 1,
    geometryVersion: "cheekbone-oval-v2",
    region: "left_cheek",
    verdict: "build",
    progress: 0.375,
    deltaA: 1,
    deltaE00: 1,
    uniformity: 0.4,
    lagging: "upper",
    provenance: "simulated",
    reportedPass: true,
    targetLevel: "full",
    targetAssetId,
    elapsedMs: 30,
    ...(sampleCheckpointId ? { sampleCheckpointId } : {}),
  };
}

describe("R2 recording provenance and exact simulated-frame selection", () => {
  it("pins eight adopted original outputs with no raw provider identifiers or private URLs", async () => {
    const bytes = await readFile(
      join(process.cwd(), "public/examples/recorded-round2.json"),
    );
    expect(sha(bytes)).toBe(RECORDED_ROUND2_MANIFEST_SHA256);
    expect(bytes.toString()).not.toMatch(
      /taskId|task_id|src_file_id|https:\/\/|artifacts\/private|download_url/,
    );
    expect(
      sha(
        await readFile(
          join(process.cwd(), "src/lib/youcam/fixtures/round2-patterns.json"),
        ),
      ),
    ).toBe(manifest.catalogExcerptSha256);
    expect(
      sha(
        await readFile(
          join(process.cwd(), "public", manifest.source.url.slice(1)),
        ),
      ),
    ).toBe(manifest.source.sha256);
    for (const record of manifest.records) {
      expect(sha(JSON.stringify(validateEffects(record.recipe)))).toBe(
        record.recipeHash,
      );
      const output = await readFile(
        join(process.cwd(), "public", record.output.url.slice(1)),
      );
      expect(sha(output)).toBe(record.output.sha256);
      const metadata = await sharp(output).metadata();
      expect([metadata.width, metadata.height]).toEqual([1024, 1280]);
      expect(record.attempts).toBe(1);
    }
  });

  it.each(["rose", "terracotta", "berry"] as const)(
    "keeps the same recorded %s first pass across chosen levels, with exact cream/powder texture",
    async (lookId) => {
      const session = await sample(lookId);
      for (const routeId of ["tap", "sweep"] as const) {
        const plan = session.candidates.find(
          (candidate) => candidate.routeId === routeId,
        )!;
        const record = manifest.records.find(
          (item) =>
            item.lookId === lookId &&
            item.texture === (routeId === "sweep" ? "matte" : "satin"),
        )!;
        for (const level of ["light", "build", "full"] as const) {
          selectPreviewLevel(plan, level);
          expect(sampleCheckpointForPlan(session, plan)).toEqual({
            url: record.output.url,
            sha256: record.output.sha256,
          });
        }
        const stored = observation(plan.previewAsset!.id, record.output.sha256);
        expect(
          sampleCheckpointForHistory(session, stored, plan.previewAsset!),
        ).toEqual({ url: record.output.url, sha256: record.output.sha256 });
      }
    },
  );

  it("binds new shadow plans to the warm25/45 catalog while an approved historical65 target stays exact", async () => {
    const session = await sample("eyes");
    const shadow = session.candidates.find(
      (candidate) => candidate.routeId === "shadow",
    )!;
    expect(shadow.previewAsset?.url).toBe(
      "/examples/round2/shadow-full-warm-v2.png",
    );
    expect(shadow.previewVariants?.map((variant) => variant.intensity)).toEqual(
      [25, 45],
    );
    const light = manifest.records.find(
      (record) => record.id === "shadow-light-warm-v2",
    )!;
    expect(sampleCheckpointForPlan(session, shadow)).toEqual({
      url: light.output.url,
      sha256: light.output.sha256,
    });
    session.activePlan = structuredClone(shadow);
    session.activePlan.recipe = makeLegacyEyeRecipe("shadow", 65);
    delete session.activePlan.previewAsset;
    session.activePlan.previewStatus = "not_requested";
    session.activePlan.previewVariants = ([25, 65] as const).map(
      (intensity) => ({
        id: intensity === 25 ? "light" : "full",
        intensity,
        recipe: makeLegacyEyeRecipe("shadow", intensity),
        previewStatus: "not_requested",
      }),
    );
    const preservedRecipe = structuredClone(session.activePlan.recipe);
    await attachRecordedSamplePreviews(session);
    expect(session.activePlan.recipe).toEqual(preservedRecipe);
    expect(session.activePlan).toMatchObject({
      previewAsset: { url: "/examples/eyes/shadow-full.png" },
    });
    expect(sampleCheckpointForPlan(session, session.activePlan)).toEqual({
      url: "/examples/eyes/shadow-light.png",
    });
  });

  it("reconstructs legacy cheek and liner history only from the existing registered Light assets", async () => {
    for (const lookId of ["rose", "eyes"] as const) {
      const session = await sample(lookId);
      const plan = session.candidates.find(
        (candidate) =>
          candidate.routeId === (lookId === "eyes" ? "liner" : "tap"),
      )!;
      const target = plan.previewAsset!;
      const light = plan.previewVariants!.find(
        (variant) => variant.id === "light",
      )!.previewAsset!;
      const stored = observation(target.id);
      expect(sampleCheckpointForHistory(session, stored, target)).toEqual({
        url: light.url,
      });
      session.assets = session.assets.filter(
        (asset) => asset.url !== light.url,
      );
      expect(
        sampleCheckpointForHistory(session, stored, target),
      ).toBeUndefined();
    }
  });

  it("refuses an unknown or missing new recording instead of reconstructing different pixels", async () => {
    const session = await sample();
    const plan = session.candidates[0];
    const frame = sampleCheckpointForPlan(session, plan)!;
    const target = plan.previewAsset!;
    expect(
      sampleCheckpointForHistory(
        session,
        observation(target.id, "f".repeat(64)),
        target,
      ),
    ).toBeUndefined();
    session.assets = session.assets.filter(
      (asset) => asset.id !== round2CheckpointAssetId(frame.sha256!),
    );
    expect(sampleCheckpointForPlan(session, plan)).toBeUndefined();
    expect(
      sampleCheckpointForHistory(
        session,
        observation(target.id, frame.sha256),
        target,
      ),
    ).toBeUndefined();
  });

  it("never substitutes public pixels for a personal or changed-source checkpoint", async () => {
    const original = await sample();
    for (const mutate of [
      (session: StudioSession) => {
        session.mode = "personal";
      },
      (session: StudioSession) => {
        session.sourceAssetId = "private-source";
      },
      (session: StudioSession) => {
        session.assets.find(
          (asset) => asset.id === session.sourceAssetId,
        )!.url = "/api/assets/another-source";
      },
    ]) {
      const session = structuredClone(original);
      mutate(session);
      expect(
        sampleCheckpointForPlan(session, session.candidates[0]),
      ).toBeUndefined();
    }
  });
});
