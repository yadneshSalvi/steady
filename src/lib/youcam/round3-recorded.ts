import { z } from "zod";
import { EffectsSchema } from "./recipes";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
/** Approved R3 pair with immutable URLs; R1/R2 catalogs remain unchanged. */
export const RecordedRound3ManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    recipeRevision: z.literal(5),
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
            id: z.enum(["shadow-light-warm-v4", "shadow-full-warm-v4"]),
            purpose: z.literal("shadow_target"),
            lookId: z.literal("eyes"),
            routeId: z.literal("shadow"),
            texture: z.literal("matte"),
            level: z.enum(["light", "full"]),
            intensity: z.union([z.literal(35), z.literal(65)]),
            recipe: EffectsSchema,
            recipeHash: digest,
            inputSha256: digest,
            providerRequestHash: digest,
            taskHash: digest,
            attempts: z.literal(1),
            generatedAt: z.string().datetime(),
            output: z
              .object({
                url: z
                  .string()
                  .regex(
                    /^\/examples\/round3\/shadow-(light|full)-warm-v4\.png$/,
                  ),
                sha256: digest,
                width: z.literal(1024),
                height: z.literal(1280),
                provenance: z.literal("virtual_preview"),
              })
              .strict(),
          })
          .strict(),
      )
      .length(2),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (new Set(manifest.records.map((record) => record.id)).size !== 2)
      context.addIssue({
        code: "custom",
        message: "Record IDs must be unique.",
      });
    for (const [index, record] of manifest.records.entries()) {
      const appearance = record.recipe.find(
          (effect) => effect.category === "eye_shadow",
        ),
        palette = appearance?.palettes[0];
      if (
        record.inputSha256 !== manifest.source.sha256 ||
        record.id !== `shadow-${record.level}-warm-v4` ||
        record.output.url !== `/examples/round3/${record.id}.png` ||
        record.intensity !== (record.level === "light" ? 35 : 65) ||
        appearance?.pattern.name !== "1color20" ||
        palette?.color !== "#68402B" ||
        palette?.texture !== "matte" ||
        palette?.colorIntensity !== record.intensity ||
        record.recipe.length !== 2
      )
        context.addIssue({
          code: "custom",
          path: ["records", index],
          message: "R3 recording does not match its exact source and recipe.",
        });
    }
  });
export type RecordedRound3Manifest = z.infer<
  typeof RecordedRound3ManifestSchema
>;
export type RecordedRound3 = RecordedRound3Manifest["records"][number];
