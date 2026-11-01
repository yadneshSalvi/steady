import type { PlanAction } from "./contracts";

/** Presentation only: saved technique text and validation history stay immutable. */
export function displayInstruction(
  action: Pick<PlanAction, "techniqueId" | "region" | "instruction">,
): string {
  const side = action.region.startsWith("left_") ? "left" : "right";
  switch (action.techniqueId) {
    case "cream-cheek-fingertip-tap":
      return `Tap cream blush onto your ${side} cheek with clean fingertips. Work up along the cheekbone.`;
    case "cream-cheek-sponge-tap":
      return `Tap cream blush onto your ${side} cheek with a makeup sponge. Work up along the cheekbone.`;
    case "powder-cheek-wide-brush":
      return `Blend powder blush along your ${side} cheekbone with a wide brush.`;
    case "cream-cheek-brush-buff":
      return `Blend cream blush with a clean brush suitable for cream products. Work up your ${side} cheekbone in broad circles.`;
    case "fine-eye-liner-short-strokes":
      return `Close your ${side} eye comfortably. Use eyeliner labeled for eyes. Make short strokes on upper lid skin, above the lashes.`;
    case "eye-shadow-fingertip-tap":
      return `Close your ${side} eye comfortably. Tap eyelid shadow onto the upper lid with a clean fingertip.`;
    case "eye-shadow-sponge-tap":
      return `Close your ${side} eye comfortably. Use a clean sponge suitable for eyelid makeup. Tap eyelid shadow onto the upper lid.`;
    case "lip-color-fingertip-tap":
      return "Tap lip color onto your lips with a clean fingertip.";
    case "lip-color-brush-short-strokes":
      return "Apply lip color within your lip outline using short brush strokes.";
    default:
      return action.instruction;
  }
}
