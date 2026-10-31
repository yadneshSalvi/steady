import type {
  CandidatePlan,
  LookId,
  Motion,
  ProductId,
  Region,
  ToolId,
} from "../contracts";

export interface TechniqueDefinition {
  id: string;
  version: 1;
  validation: "draft";
  regionKind: "cheek" | "lips" | "eye";
  lookIds: readonly LookId[];
  routeId?: CandidatePlan["routeId"];
  repairOnly?: boolean;
  tool: ToolId;
  product: ProductId;
  motion: Motion;
  precision?: "low" | "high";
  title: string;
  instruction: (region: Region) => string;
  stoppingCue: string;
  alternatives: readonly string[];
}

export const TECHNIQUE_REVIEW_NOTICE =
  "AI-assisted draft method. You choose whether the motion and result work for you.";

const lookIds = ["rose", "terracotta", "berry"] as const;
const cheekName = (region: Region) =>
  region === "left_cheek" ? "your left cheek" : "your right cheek";
const eyeName = (region: Region) =>
  region === "left_eye" ? "your left eye" : "your right eye";

/** Original draft content. No artist or participant review is asserted.
 * A product/tool must be suitable for its labeled use; a class name alone does
 * not establish a particular product's instructions or an individual's comfort.
 */
export const TECHNIQUES: readonly TechniqueDefinition[] = [
  {
    id: "fine-eye-liner-short-strokes",
    version: 1,
    validation: "draft",
    regionKind: "eye",
    lookIds: ["eyes"],
    routeId: "liner",
    tool: "liner_pen",
    product: "eye_liner",
    motion: "short_strokes",
    precision: "high",
    title: "Fine upper liner",
    instruction: (region) =>
      `With ${eyeName(region)} comfortably closed, use an eyeliner pen labeled for eye makeup to make short strokes on the upper lid skin above the lashes. Keep product out of the eye and off the waterline. Pause before checking.`,
    stoppingCue:
      "Stop at the upper-line definition you choose. Keep product out of the eye and off the waterline. Pause or skip if the motion is uncomfortable.",
    alternatives: ["eye-shadow-fingertip-tap", "eye-shadow-sponge-tap"],
  },
  {
    id: "eye-shadow-fingertip-tap",
    version: 1,
    validation: "draft",
    regionKind: "eye",
    lookIds: ["eyes"],
    routeId: "shadow",
    tool: "fingertips",
    product: "eye_shadow",
    motion: "tapping",
    precision: "low",
    title: "Soft tapped shadow",
    instruction: (region) =>
      `With ${eyeName(region)} comfortably closed, use a clean fingertip to tap eye shadow labeled for eyelids over the upper lid skin above the lashes. Aim for a soft edge. Keep product out of the eye and off the waterline. Pause before checking.`,
    stoppingCue:
      "Stop when you choose to keep the soft eye emphasis. Keep product out of the eye and off the waterline. Pause or skip if the motion is uncomfortable.",
    alternatives: ["eye-shadow-sponge-tap", "fine-eye-liner-short-strokes"],
  },
  {
    id: "eye-shadow-sponge-tap",
    version: 1,
    validation: "draft",
    regionKind: "eye",
    lookIds: ["eyes"],
    routeId: "shadow",
    tool: "sponge",
    product: "eye_shadow",
    motion: "tapping",
    precision: "low",
    title: "Soft sponge shadow",
    instruction: (region) =>
      `With ${eyeName(region)} comfortably closed, use a clean sponge suitable for eyelid makeup to tap eye shadow labeled for eyelids over the upper lid skin above the lashes. Aim for a soft edge. Keep product out of the eye and off the waterline. Pause before checking.`,
    stoppingCue:
      "Stop when you choose to keep the soft eye emphasis. Keep product out of the eye and off the waterline. Pause or skip if the motion is uncomfortable.",
    alternatives: ["eye-shadow-fingertip-tap", "fine-eye-liner-short-strokes"],
  },
  {
    id: "cream-cheek-fingertip-tap",
    version: 1,
    validation: "draft",
    regionKind: "cheek",
    lookIds,
    routeId: "tap",
    tool: "fingertips",
    product: "cream_blush",
    motion: "tapping",
    title: "Fingertip tapping",
    instruction: (region) =>
      `Use your clean fingertips to tap cream blush over ${cheekName(region)}. Pause to look at the color and edge.`,
    stoppingCue:
      "Stop when you choose to keep this amount of color, or pause if the motion is uncomfortable.",
    alternatives: ["powder-cheek-wide-brush", "cream-cheek-sponge-tap"],
  },
  {
    id: "powder-cheek-wide-brush",
    version: 1,
    validation: "draft",
    regionKind: "cheek",
    lookIds,
    routeId: "sweep",
    tool: "wide_brush",
    product: "powder_blush",
    motion: "blending",
    title: "Wide-brush blending",
    instruction: (region) =>
      `Use your wide blush brush to blend powder blush over ${cheekName(region)} with broad movements. Pause to look at the color and edge.`,
    stoppingCue:
      "Stop when you choose to keep the edge and color, or pause if the motion is uncomfortable.",
    alternatives: ["cream-cheek-fingertip-tap", "cream-cheek-sponge-tap"],
  },
  {
    id: "cream-cheek-sponge-tap",
    version: 1,
    validation: "draft",
    regionKind: "cheek",
    lookIds,
    routeId: "sponge",
    tool: "sponge",
    product: "cream_blush",
    motion: "tapping",
    title: "Sponge tapping",
    instruction: (region) =>
      `Use your makeup sponge to tap cream blush over ${cheekName(region)}. Pause to look at the color and edge.`,
    stoppingCue:
      "Stop when you choose to keep this amount of color, or pause if the motion is uncomfortable.",
    alternatives: ["cream-cheek-fingertip-tap", "powder-cheek-wide-brush"],
  },
  {
    id: "cream-cheek-brush-buff",
    version: 1,
    validation: "draft",
    regionKind: "cheek",
    lookIds,
    routeId: "buff",
    repairOnly: true,
    tool: "wide_brush",
    product: "cream_blush",
    motion: "blending",
    title: "Brush-blended cream",
    instruction: (region) =>
      `Use a clean brush suitable for cream products to gently blend cream blush over ${cheekName(region)} with small, broad circles. Keep the pressure light and pause to look at the edge.`,
    stoppingCue:
      "Stop when the edge and color suit you, or pause if the motion is uncomfortable.",
    alternatives: [
      "cream-cheek-sponge-tap",
      "cream-cheek-fingertip-tap",
      "powder-cheek-wide-brush",
    ],
  },
  {
    id: "lip-color-fingertip-tap",
    version: 1,
    validation: "draft",
    regionKind: "lips",
    lookIds,
    tool: "fingertips",
    product: "lip_color",
    motion: "tapping",
    title: "Tap on lip color",
    instruction: () =>
      "Use your clean fingertip to tap your lip color onto your lips. Pause to look at the tint.",
    stoppingCue:
      "Stop when you choose to keep the tint, or pause if the motion is uncomfortable.",
    alternatives: ["lip-color-brush-short-strokes"],
  },
  {
    id: "lip-color-brush-short-strokes",
    version: 1,
    validation: "draft",
    regionKind: "lips",
    lookIds,
    tool: "lip_brush",
    product: "lip_color",
    motion: "short_strokes",
    title: "Brush on lip color",
    instruction: () =>
      "Use your lip brush to apply your lip color with short strokes within your lips. Pause to look at the tint.",
    stoppingCue:
      "Stop when you choose to keep the tint, or pause if the motion is uncomfortable.",
    alternatives: ["lip-color-fingertip-tap"],
  },
];

export function techniqueById(id: string): TechniqueDefinition | undefined {
  return TECHNIQUES.find((technique) => technique.id === id);
}
