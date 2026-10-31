import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SAMPLE_SETUP } from "../src/lib/catalog";
import type { LookId, StudioSession } from "../src/lib/contracts";
import { applyCommand, createSession } from "../src/lib/planner";
import { attachRecordedSamplePreviews } from "../src/lib/server/recorded-previews";
import { RECORDED_MANIFEST_SHA256 } from "../src/lib/youcam/recorded-integrity";
import { RecordedSamplesManifestSchema } from "../src/lib/youcam/recorded";
import { makeRecipe, validateEffects } from "../src/lib/youcam/recipes";

const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const publicRoot = join(process.cwd(), "public");
async function manifest() {
  return RecordedSamplesManifestSchema.parse(
    JSON.parse(
      await readFile(
        join(publicRoot, "examples/recorded-samples.json"),
        "utf8",
      ),
    ),
  );
}
async function sample(
  lookId: LookId = "rose",
  includeLips = false,
): Promise<StudioSession> {
  const data = await manifest();
  const session = createSession(
    { ...structuredClone(SAMPLE_SETUP), lookId, includeLips },
    "recorded-test",
  );
  session.sourceAssetId = data.source.assetId;
  session.assets.push({
    id: data.source.assetId,
    url: data.source.url,
    provenance: "synthetic_inspiration",
    purpose: "baseline",
    createdAt: session.createdAt,
    width: data.source.width,
    height: data.source.height,
  });
  return session;
}

describe("recorded live YouCam examples (synthetic input, no physical outcome)", () => {
  it("verifies all nine original outputs, current recipes, exact source bytes and pinned manifest checksum", async () => {
    const raw = await readFile(
      join(publicRoot, "examples/recorded-samples.json"),
    );
    expect(sha(raw)).toBe(RECORDED_MANIFEST_SHA256);
    const data = await manifest();
    expect(data.records).toHaveLength(9);
    expect(
      sha(await readFile(join(publicRoot, data.source.url.slice(1)))),
    ).toBe(data.source.sha256);
    expect(raw.toString()).not.toMatch(
      /task_id|src_file_id|https:\/\/|artifacts\/private|download_url/,
    );
    for (const record of data.records) {
      expect(validateEffects(record.recipe)).toEqual(
        makeRecipe(record.lookId, record.routeId, false),
      );
      expect(sha(JSON.stringify(validateEffects(record.recipe)))).toBe(
        record.recipeHash,
      );
      expect(record.inputSha256).toBe(data.source.sha256);
      const bytes = await readFile(
        join(publicRoot, record.output.url.slice(1)),
      );
      expect(sha(bytes)).toBe(record.output.sha256);
      const metadata = await sharp(bytes).metadata();
      expect([metadata.width, metadata.height]).toEqual([
        record.output.width,
        record.output.height,
      ]);
      expect(record.output.provenance).toBe("virtual_preview");
    }
  });

  it("attaches clearly recorded previews to each matching sample look without changing actions or outcomes", async () => {
    for (const look of ["rose", "terracotta", "berry"] as const) {
      const session = await sample(look);
      const actions = session.candidates.map((candidate) =>
        structuredClone(candidate.actions),
      );
      const revision = session.revision;
      await attachRecordedSamplePreviews(session);
      expect(
        session.candidates.every(
          (candidate) =>
            candidate.previewStatus === "ready" &&
            candidate.previewAsset?.recordedAt &&
            candidate.previewAsset.provenance === "virtual_preview",
        ),
      ).toBe(true);
      expect(session.candidates.map((candidate) => candidate.actions)).toEqual(
        actions,
      );
      expect(session.outcome).toBeUndefined();
      expect(session.completedActionIds).toEqual([]);
      expect(session.revision).toBe(revision);
    }
  });

  it("never substitutes recorded images for personal, uploaded-source or lip-enabled requests", async () => {
    const personal = await sample();
    personal.mode = "personal";
    const uploaded = await sample();
    uploaded.sourceAssetId = "private-upload";
    const lips = await sample("rose", true);
    for (const session of [personal, uploaded, lips]) {
      await attachRecordedSamplePreviews(session);
      expect(
        session.candidates.every(
          (candidate) =>
            candidate.previewStatus === "not_requested" &&
            !candidate.previewAsset,
        ),
      ).toBe(true);
    }
  });

  it("does not replace an explicit live job, a private fresh output or a changed recipe", async () => {
    const session = await sample();
    session.candidates[0].previewJobId = "fresh-job";
    session.candidates[0].previewStatus = "processing";
    session.candidates[1].previewStatus = "ready";
    session.candidates[1].previewAsset = {
      id: "fresh-output",
      url: "/api/assets/fresh-output",
      provenance: "virtual_preview",
      purpose: "preview",
      createdAt: session.createdAt,
      width: 1024,
      height: 1280,
    };
    session.candidates[2].recipe[1].palettes = [
      { color: "#ffffff", texture: "matte", colorIntensity: 50 },
    ];
    const before = structuredClone(session);
    await attachRecordedSamplePreviews(session);
    expect(session).toEqual(before);
  });

  it("can restore metadata on an identical approved target without mutating its recipe", async () => {
    let session = await sample();
    session = applyCommand(session, {
      type: "approve_candidate",
      candidateId: session.candidates[0].id,
    });
    const recipe = structuredClone(session.activePlan!.recipe);
    await attachRecordedSamplePreviews(session);
    expect(session.activePlan!.recipe).toEqual(recipe);
    expect(session.activePlan!.previewAsset?.recordedAt).toBeTruthy();
    expect(session.goalChanged).toBe(false);
  });
});
