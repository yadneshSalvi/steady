import { z } from "zod";
import eyeCatalog from "./fixtures/eye-patterns.json" with { type: "json" };
import type {
  CandidatePlan,
  LookId,
  MakeupEffect,
  PreviewLevel,
  PreviewVariant,
} from "../contracts";

const percent = z.number().int().min(0).max(100);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const matteBlush = z
  .object({
    color,
    texture: z.literal("matte"),
    colorIntensity: percent,
  })
  .strict();

const satinBlush = z
  .object({
    color,
    texture: z.literal("satin"),
    colorIntensity: percent,
    glowStrength: percent,
  })
  .strict();

/** The implemented subset of the official V1.0 schemas, checked 2026-10-31.
 * Restricting to this subset prevents an unchecked effect entering a paid task.
 * Pattern 1color1 has colorNum:1 in the official blush catalog.
 */
export const EffectSchema = z.discriminatedUnion("category", [
  z
    .object({
      category: z.literal("skin_smooth"),
      skinSmoothStrength: z.literal(0),
      skinSmoothColorIntensity: z.literal(0),
    })
    .strict(),
  z
    .object({
      category: z.literal("blush"),
      pattern: z.object({ name: z.literal("1color1") }).strict(),
      palettes: z
        .array(z.discriminatedUnion("texture", [matteBlush, satinBlush]))
        .length(1),
    })
    .strict(),
  z
    .object({
      category: z.literal("lip_color"),
      shape: z.object({ name: z.literal("original") }).strict(),
      morphology: z
        .object({ fullness: z.literal(0), wrinkless: z.literal(0) })
        .strict(),
      style: z.object({ type: z.literal("full") }).strict(),
      palettes: z
        .array(
          z
            .object({
              color,
              texture: z.literal("matte"),
              colorIntensity: percent,
            })
            .strict(),
        )
        .length(1),
    })
    .strict(),
  z
    .object({
      category: z.literal("eye_liner"),
      pattern: z
        .object({ name: z.literal(eyeCatalog.patterns.eye_liner.label) })
        .strict(),
      palettes: z.array(matteBlush).length(1),
    })
    .strict(),
  z
    .object({
      category: z.literal("eye_shadow"),
      pattern: z
        .object({ name: z.literal(eyeCatalog.patterns.eye_shadow.label) })
        .strict(),
      palettes: z.array(matteBlush).length(1),
    })
    .strict(),
]);

export const EffectsSchema = z
  .array(EffectSchema)
  .min(2)
  .max(3)
  .superRefine((effects, ctx) => {
    for (const category of ["skin_smooth"] as const) {
      if (
        effects.filter((effect) => effect.category === category).length !== 1
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Exactly one ${category} effect is required.`,
        });
      }
    }
    const appearances = effects.filter((effect) =>
      ["blush", "eye_liner", "eye_shadow"].includes(effect.category),
    );
    if (appearances.length !== 1)
      ctx.addIssue({
        code: "custom",
        message: "Exactly one supported cheek or eye appearance is required.",
      });
    if (
      appearances[0]?.category !== "blush" &&
      effects.some((effect) => effect.category === "lip_color")
    )
      ctx.addIssue({
        code: "custom",
        message: "Eye-only previews cannot include lip color.",
      });
    if (
      new Set(effects.map((effect) => effect.category)).size !== effects.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Effect categories must not repeat.",
      });
    }
  });

export class InvalidRecipeError extends Error {
  readonly code = "invalid_recipe";
  readonly retryable = false;
  constructor() {
    super(
      "This preview recipe is outside STEADY's supported makeup schema. Rebuild the candidate before submitting.",
    );
    this.name = "InvalidRecipeError";
  }
}

/** Client-safe schema check; network access and credentials live in index.ts. */
export function validateEffects(effects: unknown): MakeupEffect[] {
  const parsed = EffectsSchema.safeParse(effects);
  if (!parsed.success) throw new InvalidRecipeError();
  return parsed.data;
}

const PALETTES: Record<
  Exclude<LookId, "eyes">,
  { cheek: string; lip: string }
> = {
  rose: { cheek: "#BE6680", lip: "#A54F68" },
  terracotta: { cheek: "#BF7153", lip: "#A35D46" },
  berry: { cheek: "#9D526C", lip: "#853E5D" },
};
export const RECIPE_REVISION = 3;
export const PREVIEW_LEVELS = [
  { id: "light", label: "Light", intensity: 25 },
  { id: "build", label: "Build", intensity: 45 },
  { id: "full", label: "Full", intensity: 65 },
] as const;

/** Frozen first eye-goal subset of the official single-color patterns. */
export const EYE_RECIPES = {
  liner: {
    category: "eye_liner",
    pattern: eyeCatalog.patterns.eye_liner.label,
    color: "#3A2B2B",
  },
  shadow: {
    category: "eye_shadow",
    pattern: eyeCatalog.patterns.eye_shadow.label,
    color: "#6B4A40",
  },
} as const;

/** An illustrative appearance recipe, not a calibrated physical amount or result. */
export function makeRecipe(
  lookId: LookId,
  routeId: CandidatePlan["routeId"],
  includeLips: boolean,
  intensity: 25 | 45 | 65 = 65,
): MakeupEffect[] {
  if (lookId === "eyes") {
    if (includeLips || (routeId !== "liner" && routeId !== "shadow"))
      throw new InvalidRecipeError();
    const eye = EYE_RECIPES[routeId];
    return validateEffects([
      {
        category: "skin_smooth",
        skinSmoothStrength: 0,
        skinSmoothColorIntensity: 0,
      },
      {
        category: eye.category,
        pattern: { name: eye.pattern },
        palettes: [
          { color: eye.color, texture: "matte", colorIntensity: intensity },
        ],
      },
    ]);
  }
  const palette = PALETTES[lookId];
  if (!palette || !["tap", "sweep", "sponge", "buff"].includes(routeId))
    throw new InvalidRecipeError();
  const powder = routeId === "sweep";
  const blushPalette = powder
    ? { color: palette.cheek, texture: "matte", colorIntensity: intensity }
    : {
        color: palette.cheek,
        texture: "satin",
        colorIntensity: intensity,
        glowStrength: 10,
      };
  return validateEffects([
    {
      category: "skin_smooth",
      skinSmoothStrength: 0,
      skinSmoothColorIntensity: 0,
    },
    {
      category: "blush",
      pattern: { name: "1color1" },
      palettes: [blushPalette],
    },
    ...(includeLips
      ? [
          {
            category: "lip_color",
            shape: { name: "original" },
            morphology: { fullness: 0, wrinkless: 0 },
            style: { type: "full" },
            palettes: [
              {
                color: palette.lip,
                texture: "matte",
                colorIntensity: intensity,
              },
            ],
          },
        ]
      : []),
  ]);
}

export function makePreviewVariants(
  lookId: LookId,
  routeId: CandidatePlan["routeId"],
  includeLips: boolean,
): PreviewVariant[] {
  return PREVIEW_LEVELS.filter(
    ({ id }) => lookId !== "eyes" || id !== "build",
  ).map(({ id, intensity }) => ({
    id,
    intensity,
    recipe: makeRecipe(lookId, routeId, includeLips, intensity),
    previewStatus: "not_requested",
  }));
}

/** Keep the selected target and its job provenance in one place. */
export function selectPreviewLevel(
  candidate: CandidatePlan,
  level: PreviewLevel,
): void {
  const variant = candidate.previewVariants?.find(
    (entry) => entry.id === level,
  );
  if (!variant) throw new InvalidRecipeError();
  candidate.selectedPreviewVariantId = level;
  candidate.recipe = structuredClone(variant.recipe);
  candidate.previewStatus = variant.previewStatus;
  candidate.previewAsset = variant.previewAsset
    ? structuredClone(variant.previewAsset)
    : undefined;
  candidate.previewJobId = variant.previewJobId;
  candidate.previewError = variant.previewError;
  candidate.previewRetryable = variant.previewRetryable;
}

/** Used only before any cosmetic action has been confirmed. */
export function softerRecipe(effects: MakeupEffect[]): MakeupEffect[] {
  return validateEffects(
    effects.map((effect) => {
      if (effect.category !== "blush" && effect.category !== "lip_color")
        return effect;
      return {
        ...effect,
        palettes: (effect.palettes as { [key: string]: string | number }[]).map(
          (entry) => ({
            ...entry,
            colorIntensity: Math.min(Number(entry.colorIntensity), 25),
          }),
        ),
      };
    }),
  );
}
