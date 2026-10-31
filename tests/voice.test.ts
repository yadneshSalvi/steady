import { describe, it, expect } from "vitest";
import { parseVoiceCommand } from "@/lib/voice";
describe("deliberate voice grammar", () => {
  it("requires wake word and an exact bounded command", () => {
    expect(parseVoiceCommand("Steady, pause.")).toBe("pause");
    expect(parseVoiceCommand("STEADY CHECK")).toBe("check");
    expect(parseVoiceCommand("pause")).toBeNull();
    expect(parseVoiceCommand("I think steady next would help")).toBeNull();
    expect(parseVoiceCommand("steady delete everything")).toBeNull();
  });
  it("does not combine two instructions into an implicit action", () => {
    expect(parseVoiceCommand("Steady next and stop")).toBeNull();
    expect(parseVoiceCommand("Steady pause steady next")).toBeNull();
  });
});
