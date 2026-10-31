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
  regionKind: "cheek" | "lips";
  lookIds: readonly LookId[];
  routeId?: CandidatePlan["routeId"];
  tool: ToolId;
  product: ProductId;
  motion: Motion;
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

/** Original draft content. No artist or participant review is asserted.
 * A product/tool must be suitable for its labeled use; a class name alone does
 * not establish a particular product's instructions or an individual's comfort.
 */
export const TECHNIQUES: readonly TechniqueDefinition[] = [
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
