import { z } from "zod";
import { EffectsSchema } from "./recipes";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const dimension = z.number().int().min(128).max(1919);

export const RecordedSamplesManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    recipeRevision: z.number().int().positive(),
    evidenceClass: z.literal("recorded_live_youcam_on_synthetic_source"),
    source: z
      .object({
        assetId: z.literal("sample-portrait-v1"),
        url: z.literal("/images/studio-portrait.jpg"),
        sha256: digest,
        width: dimension,
        height: dimension,
        provenance: z.literal("synthetic_inspiration"),
      })
      .strict(),
    records: z
      .array(
        z
          .object({
            lookId: z.enum(["rose", "terracotta", "berry"]),
            routeId: z.enum(["tap", "sweep", "sponge"]),
            includeLips: z.literal(false),
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
                    /^\/examples\/previews\/(rose|terracotta|berry)-(tap|sweep|sponge)\.(png|jpg)$/,
                  ),
                sha256: digest,
                width: dimension,
                height: dimension,
                provenance: z.literal("virtual_preview"),
              })
              .strict(),
          })
          .strict(),
      )
      .length(9),
  })
  .strict()
  .superRefine((manifest, context) => {
    const keys = manifest.records.map(
      (record) => `${record.lookId}-${record.routeId}`,
    );
    if (new Set(keys).size !== 9)
      context.addIssue({
        code: "custom",
        message: "Each look and method needs one distinct recorded result.",
      });
    for (const [index, record] of manifest.records.entries()) {
      if (
        record.inputSha256 !== manifest.source.sha256 ||
        !record.output.url.startsWith(
          `/examples/previews/${record.lookId}-${record.routeId}.`,
        ) ||
        record.recipe.some((effect) => effect.category === "lip_color")
      ) {
        context.addIssue({
          code: "custom",
          path: ["records", index],
          message:
            "Recorded preview does not match its declared source, route or lip choice.",
        });
      }
    }
  });

export type RecordedSamplesManifest = z.infer<
  typeof RecordedSamplesManifestSchema
>;
export type RecordedSample = RecordedSamplesManifest["records"][number];
