import manifest from "../../../public/examples/recorded-round2.json";
import type {
  CandidatePlan,
  StoredMeasurement,
  StudioAsset,
  StudioSession,
} from "../contracts";
import { EffectsSchema } from "./recipes";
import { round2CheckpointAssetId } from "./round2-recorded";

export interface SampleCheckpointFrame {
  url: string;
  sha256?: string;
}

function verifiedSample(session: StudioSession): boolean {
  return (
    session.mode === "sample" &&
    session.sourceAssetId === manifest.source.assetId &&
    session.assets.some(
      (asset) =>
        asset.id === manifest.source.assetId &&
        asset.url === manifest.source.url &&
        asset.provenance === "synthetic_inspiration" &&
        asset.purpose === "baseline",
    )
  );
}

function registeredFrame(
  session: StudioSession,
  sha256: string,
): SampleCheckpointFrame | undefined {
  const record = manifest.records.find((item) => item.output.sha256 === sha256);
  if (
    !record ||
    !session.assets.some(
      (asset) =>
        asset.id === round2CheckpointAssetId(sha256) &&
        asset.url === record.output.url &&
        asset.provenance === "virtual_preview" &&
        asset.purpose === "preview" &&
        !!asset.recordedAt,
    )
  )
    return undefined;
  return { url: record.output.url, sha256 };
}

/** Historical R1 frames keep their original Light URL and provenance. */
function legacyLightFrame(
  session: StudioSession,
  target: StudioAsset,
): SampleCheckpointFrame | undefined {
  if (
    !/^\/examples\/(ladder|eyes)\/[a-z0-9-]+-(light|build|full)\.(png|jpg)$/.test(
      target.url,
    )
  )
    return undefined;
  const url = target.url.replace(/-(light|build|full)\./, "-light.");
  return session.assets.some(
    (asset) =>
      asset.url === url &&
      asset.provenance === "virtual_preview" &&
      asset.recordedAt,
  )
    ? { url }
    : undefined;
}

/** Selects recorded pixels, never a fabricated percentage or a target-dependent blend. */
export function sampleCheckpointForPlan(
  session: StudioSession,
  plan: CandidatePlan,
): SampleCheckpointFrame | undefined {
  if (!verifiedSample(session) || !plan.previewAsset?.recordedAt)
    return undefined;
  const recipe = EffectsSchema.safeParse(plan.recipe);
  if (!recipe.success) return undefined;
  const blush = recipe.data.find((effect) => effect.category === "blush");
  const record = blush
    ? manifest.records.find(
        (item) =>
          item.purpose === "simulated_first_pass" &&
          item.lookId === session.lookId &&
          item.texture === blush.palettes[0].texture &&
          item.recipe.some(
            (effect) =>
              effect.category === "blush" &&
              effect.palettes?.[0].color === blush.palettes[0].color,
          ),
      )
    : manifest.records.some(
          (item) =>
            item.purpose === "shadow_target" &&
            item.output.url === plan.previewAsset?.url,
        )
      ? manifest.records.find((item) => item.id === "shadow-light-warm-v2")
      : undefined;
  if (record) return registeredFrame(session, record.output.sha256);
  return legacyLightFrame(session, plan.previewAsset);
}

/** Saved sample heatmaps may only reconstruct the exact recorded checkpoint. */
export function sampleCheckpointForHistory(
  session: StudioSession,
  measurement: StoredMeasurement,
  target: StudioAsset,
): SampleCheckpointFrame | undefined {
  if (
    !verifiedSample(session) ||
    measurement.provenance !== "simulated" ||
    !target.recordedAt
  )
    return undefined;
  return measurement.sampleCheckpointId
    ? registeredFrame(session, measurement.sampleCheckpointId)
    : legacyLightFrame(session, target);
}
