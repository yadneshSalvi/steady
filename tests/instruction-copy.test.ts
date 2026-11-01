import { describe, expect, it } from "vitest";
import { displayInstruction } from "@/lib/instruction-copy";
import { TECHNIQUES } from "@/lib/planner/library";
import type { Region } from "@/lib/contracts";

describe("short instruction presentation", () => {
  it("keeps every shipped procedure immutable and sentences within twelve words", () => {
    for (const technique of TECHNIQUES) {
      const regions: Region[] =
        technique.regionKind === "eye"
          ? ["left_eye", "right_eye"]
          : technique.regionKind === "cheek"
            ? ["left_cheek", "right_cheek"]
            : ["lips"];
      for (const region of regions) {
        const action = {
          techniqueId: technique.id,
          region,
          instruction: technique.instruction(region),
        };
        const stored = JSON.stringify(action);
        const text = displayInstruction(action);
        for (const sentence of text.split(".").filter((value) => value.trim()))
          expect(sentence.trim().split(/\s+/).length, text).toBeLessThanOrEqual(
            12,
          );
        expect(JSON.stringify(action)).toBe(stored);
        if (region.endsWith("_eye")) {
          expect(text).toContain(
            `Close your ${region.startsWith("left") ? "left" : "right"} eye comfortably.`,
          );
          expect(text).toContain("upper lid");
        }
      }
    }
  });
  it("preserves instructions for an unfamiliar stored technique", () => {
    expect(
      displayInstruction({
        techniqueId: "historical-special-method",
        region: "left_cheek",
        instruction: "Keep this historical procedure.",
      }),
    ).toBe("Keep this historical procedure.");
  });
  it("gives cheekbone direction without inventing a stroke count", () => {
    const text = displayInstruction({
      techniqueId: "cream-cheek-brush-buff",
      region: "right_cheek",
      instruction: "Stored full procedure",
    });
    expect(text).toContain("suitable for cream products");
    expect(text).toContain("right cheekbone in broad circles");
    expect(text).not.toMatch(/\d/);
  });
});
