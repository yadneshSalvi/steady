import { z } from "zod";
import { EffectsSchema } from "./recipes";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const RecordedEyesManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceClass: z.literal("recorded_live_youcam_on_synthetic_source"),
    source: z
      .object({
        assetId: z.literal("sample-portrait-v1"),
        url: z.literal("/images/studio-portrait.jpg"),
        sha256: digest,
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict(),
    records: z
      .array(
        z
          .object({
            routeId: z.enum(["liner", "shadow"]),
            level: z.enum(["light", "full"]),
            intensity: z.union([z.literal(25), z.literal(65)]),
            recipe: EffectsSchema,
            recipeHash: digest,
            inputSha256: digest,
            providerRequestHash: digest,
            taskHash: digest,
            generatedAt: z.string().datetime(),
            output: z
              .object({
                url: z
                  .string()
                  .regex(
                    /^\/examples\/eyes\/(liner|shadow)-(light|full)\.(png|jpg)$/,
                  ),
                sha256: digest,
                width: z.number().int().positive(),
                height: z.number().int().positive(),
                provenance: z.literal("virtual_preview"),
              })
              .strict(),
          })
          .strict(),
      )
      .length(4),
  })
  .strict()
  .superRefine((manifest, context) => {
    const keys = manifest.records.map(
      (item) => `${item.routeId}-${item.level}`,
    );
    if (new Set(keys).size !== 4)
      context.addIssue({
        code: "custom",
        message: "Every eye method and level needs its exact recording.",
      });
    for (const [index, record] of manifest.records.entries()) {
      const category = record.routeId === "liner" ? "eye_liner" : "eye_shadow";
      const eye = record.recipe.find((effect) => effect.category === category);
      if (
        record.inputSha256 !== manifest.source.sha256 ||
        !record.output.url.startsWith(`/examples/eyes/${keys[index]}.`) ||
        record.intensity !== (record.level === "light" ? 25 : 65) ||
        !eye ||
        !("palettes" in eye) ||
        eye.palettes[0].colorIntensity !== record.intensity ||
        record.recipe.some(
          (effect) => !["skin_smooth", category].includes(effect.category),
        )
      )
        context.addIssue({
          code: "custom",
          path: ["records", index],
          message:
            "An eye recording does not match its source, method or intensity.",
        });
    }
  });
export type RecordedEyesManifest = z.infer<typeof RecordedEyesManifestSchema>;
