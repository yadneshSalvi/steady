import type {
  LookDefinition,
  Motion,
  Preferences,
  ProductId,
  SetupInput,
  ToolId,
} from "./contracts";

/** Editorial illustrations are inspiration, never participant results. */
export const LOOKS: LookDefinition[] = [
  {
    id: "rose",
    title: "Rose",
    subtitle: "Soft rose · a quiet wash of color",
    description:
      "A rose cheek tint, with optional lip color. Choose the method that fits the tools and movements you confirm.",
    color: "#BE6680",
    lipColor: "#A54F68",
    image: "/images/studio-portrait.jpg",
    attributes: ["Rose color family", "Soft cheek color", "Optional lip tint"],
  },
  {
    id: "terracotta",
    title: "Terracotta",
    subtitle: "Earthy warmth · softly expressed",
    description: "Warm cheek color with an optional matching lip.",
    color: "#BF7153",
    lipColor: "#A35D46",
    image: "/images/inspiration-terracotta.jpg",
    attributes: [
      "Terracotta color family",
      "Soft cheek color",
      "Optional lip tint",
    ],
  },
  {
    id: "berry",
    title: "Berry",
    subtitle: "A berry tint · your chosen emphasis",
    description:
      "A berry cheek tint with optional lip color. Keep the color family while comparing fingertip, brush and sponge methods.",
    color: "#9D526C",
    lipColor: "#853E5D",
    image: "/images/inspiration-berry.jpg",
    attributes: ["Berry color family", "Soft cheek color", "Optional lip tint"],
  },
  {
    id: "eyes",
    title: "Defined eyes",
    subtitle: "Fine liner or a softer shadow edge",
    description:
      "Keep eye emphasis while choosing a fine upper line or softly tapped shadow. Confirm eye-labeled products, a suitable tool, and the movement you prefer.",
    color: "#6B4A40",
    lipColor: "#6B4A40",
    image: "/images/studio-portrait.jpg",
    attributes: ["Eye emphasis", "Fine line or soft shadow"],
  },
];

export const TOOL_LABELS: Record<ToolId, string> = {
  fingertips: "Fingertips",
  sponge: "Makeup sponge",
  wide_brush: "Wide blush brush",
  lip_brush: "Lip brush",
  liner_pen: "Eyeliner pen",
};

export const PRODUCT_LABELS: Record<ProductId, string> = {
  cream_blush: "Cream blush",
  powder_blush: "Powder blush",
  lip_color: "Lip color",
  eye_liner: "Eye liner",
  eye_shadow: "Eye shadow",
};

export const MOTION_LABELS: Record<Motion, string> = {
  tapping: "Tapping",
  blending: "Broad blending",
  short_strokes: "Short strokes",
};

export const DEFAULT_PREFERENCES: Preferences = {
  movements: {
    tapping: "unknown",
    blending: "unknown",
    short_strokes: "unknown",
  },
  hand: "either",
  pace: "my_pace",
  audio: false,
  mirror: true,
};

/** These are explicit choices for a synthetic walkthrough, not inferred abilities. */
export const SAMPLE_SETUP: SetupInput = {
  lookId: "rose",
  includeLips: false,
  preferences: {
    ...DEFAULT_PREFERENCES,
    movements: {
      tapping: "comfortable",
      blending: "comfortable",
      short_strokes: "comfortable",
    },
  },
  tools: ["fingertips", "wide_brush", "sponge", "lip_brush"],
  products: ["cream_blush", "powder_blush", "lip_color"],
  mode: "sample",
  consent: false,
};

/** Explicit synthetic eye walkthrough choices, never inferred from the portrait. */
export const EYE_SAMPLE_SETUP: SetupInput = {
  ...structuredClone(SAMPLE_SETUP),
  lookId: "eyes",
  includeLips: false,
  tools: ["liner_pen", "fingertips", "sponge"],
  products: ["eye_liner", "eye_shadow"],
};
