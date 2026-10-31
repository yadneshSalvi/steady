import { describe, expect, it } from "vitest";
import { EYE_SAMPLE_SETUP, SAMPLE_SETUP } from "../src/lib/catalog";
import type { SetupInput } from "../src/lib/contracts";
import { createSession } from "../src/lib/planner";
import { assertUploadStage } from "../src/lib/server/assets";
import { newSession } from "../src/lib/server/sessions";
import { setupSchema, commandSchema } from "../src/lib/server/validation";
import { attachRecordedSamplePreviews } from "../src/lib/server/recorded-previews";

describe("recorded sample contract", () => {
  it("rejects new sample lip recipes while preserving personal optional lips", () => {
    const sample = {
      ...structuredClone(SAMPLE_SETUP),
      includeLips: true,
      consent: true,
    };
    expect(setupSchema.safeParse(sample).success).toBe(false);
    expect(
      commandSchema.safeParse({ type: "update_setup", setup: sample }).success,
    ).toBe(false);
    expect(setupSchema.safeParse({ ...sample, mode: "personal" }).success).toBe(
      true,
    );
  });
  it("rejects unsupported sample lips before creating a database studio", async () => {
    await expect(
      newSession("unpersisted-owner", {
        ...structuredClone(SAMPLE_SETUP),
        includeLips: true,
        consent: true,
      }),
    ).rejects.toMatchObject({ code: "SAMPLE_LIPS_UNAVAILABLE", status: 400 });
  });
  it("keeps the recorded sample source fixed while personal uploads remain available", () => {
    const sample = createSession(
      { ...structuredClone(SAMPLE_SETUP), consent: true },
      "fixed-sample",
    );
    for (const purpose of ["baseline", "checkpoint", "final"] as const)
      expect(() => assertUploadStage(sample, purpose)).toThrow(
        /recorded sample keeps its fictional source/,
      );
    const personal = createSession(
      { ...structuredClone(SAMPLE_SETUP), mode: "personal", consent: true },
      "personal",
    );
    expect(() => assertUploadStage(personal, "baseline")).not.toThrow();
  });
  it("has exact recordings for every supported sample method and level", async () => {
    const setups: SetupInput[] = [];
    for (const lookId of ["rose", "terracotta", "berry"] as const)
      for (const [tool, product] of [
        ["fingertips", "cream_blush"],
        ["sponge", "cream_blush"],
        ["wide_brush", "powder_blush"],
        ["wide_brush", "cream_blush"],
      ] as const)
        setups.push({
          ...structuredClone(SAMPLE_SETUP),
          lookId,
          tools: [tool],
          products: [product],
          consent: true,
        });
    for (const [tool, product] of [
      ["liner_pen", "eye_liner"],
      ["fingertips", "eye_shadow"],
      ["sponge", "eye_shadow"],
    ] as const)
      setups.push({
        ...structuredClone(EYE_SAMPLE_SETUP),
        tools: [tool],
        products: [product],
        consent: true,
      });
    for (const setup of setups) {
      const session = createSession(setup, "recording-coverage");
      session.sourceAssetId = "sample-portrait-v1";
      session.assets.push({
        id: session.sourceAssetId,
        url: "/images/studio-portrait.jpg",
        purpose: "baseline",
        provenance: "synthetic_inspiration",
        width: 1024,
        height: 1280,
        createdAt: session.createdAt,
      });
      await attachRecordedSamplePreviews(session);
      expect(session.candidates).toHaveLength(1);
      expect(
        session.candidates[0].previewVariants?.every(
          (variant) =>
            variant.previewStatus === "ready" &&
            !!variant.previewAsset?.recordedAt,
        ),
      ).toBe(true);
    }
  });
});
