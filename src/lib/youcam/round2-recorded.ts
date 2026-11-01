import { z } from "zod";
import { EffectsSchema } from "./recipes";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const recordId = z.enum([
  "blush-rose-satin",
  "blush-rose-matte",
  "blush-terracotta-satin",
  "blush-terracotta-matte",
  "blush-berry-satin",
  "blush-berry-matte",
  "shadow-light-warm-v2",
  "shadow-full-warm-v2",
]);

/** Separate immutable provenance for the R2 first-pass and warm-eye recordings. */
export const RecordedRound2ManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    recipeRevision: z.literal(4),
    evidenceClass: z.literal("recorded_live_youcam_on_synthetic_source"),
    catalogExcerptSha256: digest,
    source: z
      .object({
        assetId: z.literal("sample-portrait-v1"),
        url: z.literal("/images/studio-portrait.jpg"),
        sha256: digest,
        width: z.literal(1024),
        height: z.literal(1280),
        provenance: z.literal("synthetic_inspiration"),
      })
      .strict(),
    records: z
      .array(
        z
          .object({
            id: recordId,
            purpose: z.enum(["simulated_first_pass", "shadow_target"]),
            lookId: z.enum(["rose", "terracotta", "berry", "eyes"]),
            texture: z.enum(["satin", "matte"]),
            level: z.enum(["first_pass", "light", "full"]),
            intensity: z.union([z.literal(25), z.literal(45)]),
            recipe: EffectsSchema,
            recipeHash: digest,
            inputSha256: digest,
            providerRequestHash: digest,
            taskHash: digest,
            attempts: z.literal(1),
            generatedAt: z.string().datetime(),
            output: z
              .object({
                url: z.string().regex(/^\/examples\/round2\/[a-z0-9-]+\.png$/),
                sha256: digest,
                width: z.literal(1024),
                height: z.literal(1280),
                provenance: z.literal("virtual_preview"),
              })
              .strict(),
          })
          .strict(),
      )
      .length(8),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (new Set(manifest.records.map((record) => record.id)).size !== 8)
      context.addIssue({
        code: "custom",
        message: "Record IDs must be unique.",
      });
    for (const [index, record] of manifest.records.entries()) {
      const appearance = record.recipe.find(
        (effect) =>
          effect.category === "blush" || effect.category === "eye_shadow",
      );
      const palette = appearance?.palettes[0];
      const isBlush = record.purpose === "simulated_first_pass";
      if (
        record.inputSha256 !== manifest.source.sha256 ||
        record.output.url !== `/examples/round2/${record.id}.png` ||
        palette?.colorIntensity !== record.intensity ||
        palette?.texture !== record.texture ||
        (isBlush
          ? record.id !== `blush-${record.lookId}-${record.texture}` ||
            record.level !== "first_pass" ||
            record.intensity !== 45 ||
            appearance?.category !== "blush" ||
            appearance.pattern.name !== "Circle2"
          : record.lookId !== "eyes" ||
            record.id !== `shadow-${record.level}-warm-v2` ||
            record.intensity !== (record.level === "light" ? 25 : 45) ||
            appearance?.category !== "eye_shadow" ||
            appearance.pattern.name !== "1color20" ||
            palette?.color !== "#805036" ||
            record.texture !== "matte")
      )
        context.addIssue({
          code: "custom",
          path: ["records", index],
          message: "Recording does not match its declared source and recipe.",
        });
    }
  });

export type RecordedRound2Manifest = z.infer<
  typeof RecordedRound2ManifestSchema
>;
export type RecordedRound2 = RecordedRound2Manifest["records"][number];
export const round2CheckpointAssetId = (sha256: string) =>
  `sample-checkpoint-${sha256}`;
