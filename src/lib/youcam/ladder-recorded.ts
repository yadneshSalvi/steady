import { z } from "zod";
import { EffectsSchema } from "./recipes";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const RecordedLadderManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    recipeRevision: z.literal(3),
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
            lookId: z.enum(["rose", "terracotta", "berry"]),
            texture: z.enum(["satin", "matte"]),
            level: z.enum(["light", "build", "full"]),
            intensity: z.union([z.literal(25), z.literal(45), z.literal(65)]),
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
                    /^\/examples\/ladder\/(rose|terracotta|berry)-(satin|matte)-(light|build|full)\.(png|jpg)$/,
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
      .length(18),
  })
  .strict()
  .superRefine((manifest, context) => {
    const keys = manifest.records.map(
      (item) => `${item.lookId}-${item.texture}-${item.level}`,
    );
    if (new Set(keys).size !== 18)
      context.addIssue({
        code: "custom",
        message:
          "Each color, texture and intensity needs an exact recorded result.",
      });
    for (const [index, record] of manifest.records.entries()) {
      const blush = record.recipe.find((effect) => effect.category === "blush");
      const palette =
        blush?.category === "blush" ? blush.palettes[0] : undefined;
      if (
        record.inputSha256 !== manifest.source.sha256 ||
        !record.output.url.startsWith(`/examples/ladder/${keys[index]}.`) ||
        record.intensity !==
          ({ light: 25, build: 45, full: 65 } as const)[record.level] ||
        palette?.colorIntensity !== record.intensity ||
        palette.texture !== record.texture ||
        record.recipe.some((effect) => effect.category === "lip_color")
      )
        context.addIssue({
          code: "custom",
          path: ["records", index],
          message:
            "A recorded ladder declaration does not match its exact source or recipe.",
        });
    }
  });

export type RecordedLadderManifest = z.infer<
  typeof RecordedLadderManifestSchema
>;
