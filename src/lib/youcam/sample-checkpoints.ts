import manifest from "../../../public/examples/recorded-round2.json" with { type: "json" };
import round3 from "../../../public/examples/recorded-round3.json" with { type: "json" };
import ladders from "../../../public/examples/recorded-ladders.json" with { type: "json" };
import eyes from "../../../public/examples/recorded-eyes.json" with { type: "json" };
import legacy from "../../../public/examples/recorded-samples.json" with { type: "json" };
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
const checkpoints = [...manifest.records, ...round3.records];
const targets = [
  ...ladders.records,
  ...eyes.records,
  ...legacy.records,
  ...manifest.records.filter((record) => record.purpose === "shadow_target"),
  ...round3.records,
];
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
function knownTarget(target: StudioAsset) {
  return target.provenance === "virtual_preview"
    ? targets.find((record) => record.output.url === target.url)
    : undefined;
}
function canonicalRecipe(recipe: unknown): string | undefined {
  const parsed = EffectsSchema.safeParse(recipe);
  return parsed.success ? JSON.stringify(parsed.data) : undefined;
}
function registeredFrame(
  session: StudioSession,
  sha256: string,
): SampleCheckpointFrame | undefined {
  const record = checkpoints.find((item) => item.output.sha256 === sha256);
  if (
    !record ||
    !session.assets.some(
      (asset) =>
        asset.id === round2CheckpointAssetId(sha256) &&
        asset.url === record.output.url &&
        asset.provenance === "virtual_preview" &&
        asset.purpose === "preview",
    )
  )
    return undefined;
  return { url: record.output.url, sha256 };
}
/** Original registered Light bytes remain the fallback for timestamp-free R1 assets. */
function legacyLightFrame(
  session: StudioSession,
  target: StudioAsset,
): SampleCheckpointFrame | undefined {
  if (
    !knownTarget(target) ||
    !/^\/examples\/(ladder|eyes)\/[a-z0-9-]+-(light|build|full)\.(png|jpg)$/.test(
      target.url,
    )
  )
    return undefined;
  const url = target.url.replace(/-(light|build|full)\./, "-light.");
  return targets.some((record) => record.output.url === url) &&
    session.assets.some(
      (asset) =>
        asset.url === url &&
        asset.provenance === "virtual_preview" &&
        asset.purpose === "preview",
    )
    ? { url }
    : undefined;
}
/** Old nine-preview sessions predate a checkpoint registry. Use a known real first pass. */
function legacyFirstPass(
  session: StudioSession,
  target: StudioAsset,
): SampleCheckpointFrame | undefined {
  const original = legacy.records.find(
    (record) =>
      record.output.url === target.url && record.lookId === session.lookId,
  );
  if (!original) return undefined;
  const blush = EffectsSchema.parse(original.recipe).find(
    (effect) => effect.category === "blush",
  );
  if (!blush) return undefined;
  const record = manifest.records.find(
    (item) =>
      item.purpose === "simulated_first_pass" &&
      item.lookId === original.lookId &&
      item.texture === blush.palettes[0].texture &&
      item.recipe.some(
        (effect) =>
          effect.category === "blush" &&
          effect.palettes?.[0].color === blush.palettes[0].color,
      ),
  );
  return record
    ? { url: record.output.url, sha256: record.output.sha256 }
    : undefined;
}
/** Selects exact provider pixels, never a fabricated percentage or a target blend. */
export function sampleCheckpointForPlan(
  session: StudioSession,
  plan: CandidatePlan,
): SampleCheckpointFrame | undefined {
  if (!verifiedSample(session) || !plan.previewAsset) return undefined;
  const target = knownTarget(plan.previewAsset),
    recipe = EffectsSchema.safeParse(plan.recipe);
  if (
    !target ||
    !recipe.success ||
    canonicalRecipe(recipe.data) !== canonicalRecipe(target.recipe)
  )
    return undefined;
  const original = legacyFirstPass(session, plan.previewAsset);
  if (original) return original;
  // Timestamp-free historical ladder/liner targets retain their original Light frame.
  if (!plan.previewAsset.recordedAt) {
    const old = legacyLightFrame(session, plan.previewAsset);
    if (old) return old;
  }
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
    : round3.records.some((item) => item.output.url === plan.previewAsset?.url)
      ? round3.records.find((item) => item.level === "light")
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
/** History may reconstruct only its exact recorded frame, with legacy scope intact. */
export function sampleCheckpointForHistory(
  session: StudioSession,
  measurement: StoredMeasurement,
  target: StudioAsset,
): SampleCheckpointFrame | undefined {
  if (
    !verifiedSample(session) ||
    measurement.provenance !== "simulated" ||
    !knownTarget(target)
  )
    return undefined;
  if (measurement.sampleCheckpointId) {
    const registered = registeredFrame(session, measurement.sampleCheckpointId);
    if (registered) return registered;
    const old = legacyFirstPass(session, target);
    return old?.sha256 === measurement.sampleCheckpointId ? old : undefined;
  }
  return legacyLightFrame(session, target);
}
