import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StudioAsset, StudioSession } from "../contracts";
import { validateEffects } from "../youcam/recipes";
import { RECORDED_MANIFEST_SHA256 } from "../youcam/recorded-integrity";
import {
  RecordedSamplesManifestSchema,
  type RecordedSamplesManifest,
} from "../youcam/recorded";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const recipeHash = (effects: unknown) =>
  hash(JSON.stringify(validateEffects(effects)));

async function verifiedCatalog(): Promise<RecordedSamplesManifest | undefined> {
  if (!RECORDED_MANIFEST_SHA256) return undefined;
  try {
    const root = join(process.cwd(), "public");
    const [raw, source] = await Promise.all([
      readFile(join(root, "examples/recorded-samples.json")),
      readFile(join(root, "images/studio-portrait.jpg")),
    ]);
    if (hash(raw) !== RECORDED_MANIFEST_SHA256) return undefined;
    const parsed = RecordedSamplesManifestSchema.safeParse(
      JSON.parse(raw.toString("utf8")),
    );
    if (!parsed.success || hash(source) !== parsed.data.source.sha256)
      return undefined;
    const checks = await Promise.all(
      parsed.data.records.map(async (record) => {
        if (
          recipeHash(record.recipe) !== record.recipeHash ||
          record.inputSha256 !== parsed.data.source.sha256
        )
          return false;
        const output = await readFile(join(root, record.output.url.slice(1)));
        return hash(output) === record.output.sha256;
      }),
    );
    return checks.every(Boolean) ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// This caches immutable public deployment assets, never jobs or user captures.
let catalog: Promise<RecordedSamplesManifest | undefined> | undefined;

export async function attachRecordedSamplePreviews(
  session: StudioSession,
): Promise<void> {
  if (
    session.mode !== "sample" ||
    session.sourceAssetId !== "sample-portrait-v1" ||
    session.includeLips
  )
    return;
  const source = session.assets.find(
    (asset) => asset.id === session.sourceAssetId,
  );
  if (
    !source ||
    source.provenance !== "synthetic_inspiration" ||
    source.purpose !== "baseline" ||
    source.url !== "/images/studio-portrait.jpg"
  )
    return;
  catalog ??= verifiedCatalog();
  const manifest = await catalog;
  if (!manifest) {
    catalog = undefined;
    return;
  }
  if (
    source.width !== manifest.source.width ||
    source.height !== manifest.source.height
  )
    return;
  for (const candidate of session.candidates) {
    // An explicitly requested live job retains its status and private output.
    if (
      candidate.previewJobId ||
      (candidate.previewAsset && !candidate.previewAsset.recordedAt)
    )
      continue;
    const record = manifest.records.find(
      (entry) =>
        entry.lookId === session.lookId &&
        entry.routeId === candidate.routeId &&
        !entry.includeLips,
    );
    if (!record) continue;
    let currentRecipe: string;
    try {
      currentRecipe = recipeHash(candidate.recipe);
    } catch {
      continue;
    }
    if (currentRecipe !== record.recipeHash) continue;
    const asset: StudioAsset = {
      id: `recorded-${record.lookId}-${record.routeId}-${record.inputSha256.slice(0, 12)}-${record.recipeHash.slice(0, 16)}`,
      url: record.output.url,
      provenance: "virtual_preview",
      purpose: "preview",
      createdAt: record.generatedAt,
      recordedAt: record.generatedAt,
      providerRequestHash: record.providerRequestHash,
      width: record.output.width,
      height: record.output.height,
    };
    candidate.previewStatus = "ready";
    candidate.previewAsset = asset;
    delete candidate.previewError;
    if (!session.assets.some((item) => item.id === asset.id))
      session.assets.push(asset);
    if (
      session.activePlan?.id === candidate.id &&
      !session.activePlan.previewJobId &&
      (!session.activePlan.previewAsset ||
        session.activePlan.previewAsset.recordedAt)
    ) {
      try {
        if (recipeHash(session.activePlan.recipe) === record.recipeHash) {
          session.activePlan.previewStatus = "ready";
          session.activePlan.previewAsset = { ...asset };
        }
      } catch {
        /* A newer or unsupported approved recipe remains untouched. */
      }
    }
  }
}
