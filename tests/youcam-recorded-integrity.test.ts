import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../src/lib/planner";
import { EYE_SAMPLE_SETUP, SAMPLE_SETUP } from "../src/lib/catalog";

const corruption = vi.hoisted(() => ({ target: "none" }));
vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  return {
    ...actual,
    readFile: async (
      path: Parameters<typeof actual.readFile>[0],
      options?: Parameters<typeof actual.readFile>[1],
    ) => {
      const value = await actual.readFile(path, options);
      const name = String(path);
      const affected =
        (corruption.target === "manifest" &&
          name.endsWith("recorded-ladders.json")) ||
        (corruption.target === "source" &&
          name.endsWith("studio-portrait.jpg")) ||
        (corruption.target === "output" &&
          name.endsWith("rose-satin-light.png")) ||
        (corruption.target === "eye_manifest" &&
          name.endsWith("recorded-eyes.json")) ||
        (corruption.target === "eye_output" &&
          name.endsWith("shadow-light.png"));
      return affected ? Buffer.from("corrupted fixture bytes") : value;
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  corruption.target = "none";
});
function sample(eyes = false) {
  const session = createSession(
    structuredClone(eyes ? EYE_SAMPLE_SETUP : SAMPLE_SETUP),
    "integrity-test",
  );
  session.sourceAssetId = "sample-portrait-v1";
  session.assets.push({
    id: session.sourceAssetId,
    url: "/images/studio-portrait.jpg",
    purpose: "baseline",
    provenance: "synthetic_inspiration",
    createdAt: session.createdAt,
    width: 1024,
    height: 1280,
  });
  return session;
}

describe("recorded preview checksum boundaries", () => {
  it("establishes the intact fixture can attach before testing corruption", async () => {
    const { attachRecordedSamplePreviews } =
      await import("../src/lib/server/recorded-previews");
    const session = sample();
    await attachRecordedSamplePreviews(session);
    expect(
      session.candidates.every(
        (candidate) => candidate.previewStatus === "ready",
      ),
    ).toBe(true);
  });
  for (const target of ["manifest", "source", "output"]) {
    it(`declines all recorded images when the ${target} checksum does not match`, async () => {
      corruption.target = target;
      const { attachRecordedSamplePreviews } =
        await import("../src/lib/server/recorded-previews");
      const session = sample();
      await attachRecordedSamplePreviews(session);
      expect(
        session.candidates.every(
          (candidate) =>
            candidate.previewStatus === "not_requested" &&
            !candidate.previewAsset,
        ),
      ).toBe(true);
      expect(session.assets).toHaveLength(1);
      expect(session.outcome).toBeUndefined();
    });
  }
  for (const target of ["eye_manifest", "source", "eye_output"]) {
    it(`declines eye recordings when ${target} bytes changed`, async () => {
      corruption.target = target;
      const { attachRecordedSamplePreviews } =
        await import("../src/lib/server/recorded-previews");
      const session = sample(true);
      await attachRecordedSamplePreviews(session);
      expect(session.candidates).toHaveLength(2);
      expect(
        session.candidates.every(
          (candidate) =>
            !candidate.previewAsset &&
            candidate.previewVariants?.every(
              (variant) => !variant.previewAsset,
            ),
        ),
      ).toBe(true);
      expect(session.assets).toHaveLength(1);
    });
  }
});
