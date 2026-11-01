import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StudioAsset, StudioSession } from "../contracts";
import { selectPreviewLevel, validateEffects } from "../youcam/recipes";
import { RECORDED_LADDER_MANIFEST_SHA256 } from "../youcam/ladder-integrity";
import {
  RecordedLadderManifestSchema,
  type RecordedLadderManifest,
} from "../youcam/ladder-recorded";
import { RECORDED_EYES_MANIFEST_SHA256 } from "../youcam/eye-integrity";
import { RECORDED_ROUND2_MANIFEST_SHA256 } from "../youcam/round2-integrity";
import { RECORDED_ROUND3_MANIFEST_SHA256 } from "../youcam/round3-integrity";
import {
  RecordedRound3ManifestSchema,
  type RecordedRound3Manifest,
} from "../youcam/round3-recorded";
import {
  RecordedRound2ManifestSchema,
  round2CheckpointAssetId,
  type RecordedRound2Manifest,
} from "../youcam/round2-recorded";
import {
  RecordedEyesManifestSchema,
  type RecordedEyesManifest,
} from "../youcam/eye-recorded";
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
let ladders: Promise<RecordedLadderManifest | undefined> | undefined;
let eyes: Promise<RecordedEyesManifest | undefined> | undefined;
let round2: Promise<RecordedRound2Manifest | undefined> | undefined;
let round3: Promise<RecordedRound3Manifest | undefined> | undefined;

async function verifiedRound3(): Promise<RecordedRound3Manifest | undefined> {
  try {
    const root = join(process.cwd(), "public");
    const [raw, source] = await Promise.all([
      readFile(join(root, "examples/recorded-round3.json")),
      readFile(join(root, "images/studio-portrait.jpg")),
    ]);
    if (hash(raw) !== RECORDED_ROUND3_MANIFEST_SHA256) return undefined;
    const manifest = RecordedRound3ManifestSchema.parse(
      JSON.parse(raw.toString("utf8")),
    );
    if (hash(source) !== manifest.source.sha256) return undefined;
    const verified = await Promise.all(
      manifest.records.map(
        async (record) =>
          recipeHash(record.recipe) === record.recipeHash &&
          hash(await readFile(join(root, record.output.url.slice(1)))) ===
            record.output.sha256,
      ),
    );
    return verified.every(Boolean) ? manifest : undefined;
  } catch {
    return undefined;
  }
}

async function verifiedRound2(): Promise<RecordedRound2Manifest | undefined> {
  try {
    const root = join(process.cwd(), "public");
    const [raw, source] = await Promise.all([
      readFile(join(root, "examples/recorded-round2.json")),
      readFile(join(root, "images/studio-portrait.jpg")),
    ]);
    if (hash(raw) !== RECORDED_ROUND2_MANIFEST_SHA256) return undefined;
    const manifest = RecordedRound2ManifestSchema.parse(
      JSON.parse(raw.toString("utf8")),
    );
    if (hash(source) !== manifest.source.sha256) return undefined;
    const verified = await Promise.all(
      manifest.records.map(
        async (record) =>
          recipeHash(record.recipe) === record.recipeHash &&
          hash(await readFile(join(root, record.output.url.slice(1)))) ===
            record.output.sha256,
      ),
    );
    return verified.every(Boolean) ? manifest : undefined;
  } catch {
    return undefined;
  }
}

async function verifiedEyes(): Promise<RecordedEyesManifest | undefined> {
  if (!RECORDED_EYES_MANIFEST_SHA256) return undefined;
  try {
    const root = join(process.cwd(), "public");
    const [raw, source] = await Promise.all([
      readFile(join(root, "examples/recorded-eyes.json")),
      readFile(join(root, "images/studio-portrait.jpg")),
    ]);
    if (hash(raw) !== RECORDED_EYES_MANIFEST_SHA256) return undefined;
    const manifest = RecordedEyesManifestSchema.parse(
      JSON.parse(raw.toString("utf8")),
    );
    if (hash(source) !== manifest.source.sha256) return undefined;
    const verified = await Promise.all(
      manifest.records.map(
        async (record) =>
          recipeHash(record.recipe) === record.recipeHash &&
          hash(await readFile(join(root, record.output.url.slice(1)))) ===
            record.output.sha256,
      ),
    );
    return verified.every(Boolean) ? manifest : undefined;
  } catch {
    return undefined;
  }
}

async function verifiedLadders(): Promise<RecordedLadderManifest | undefined> {
  if (!RECORDED_LADDER_MANIFEST_SHA256) return undefined;
  try {
    const root = join(process.cwd(), "public");
    const [raw, source] = await Promise.all([
      readFile(join(root, "examples/recorded-ladders.json")),
      readFile(join(root, "images/studio-portrait.jpg")),
    ]);
    if (hash(raw) !== RECORDED_LADDER_MANIFEST_SHA256) return undefined;
    const manifest = RecordedLadderManifestSchema.parse(
      JSON.parse(raw.toString("utf8")),
    );
    if (hash(source) !== manifest.source.sha256) return undefined;
    const verified = await Promise.all(
      manifest.records.map(
        async (record) =>
          recipeHash(record.recipe) === record.recipeHash &&
          hash(await readFile(join(root, record.output.url.slice(1)))) ===
            record.output.sha256,
      ),
    );
    return verified.every(Boolean) ? manifest : undefined;
  } catch {
    return undefined;
  }
}

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
  let ladder: RecordedLadderManifest | RecordedEyesManifest | undefined;
  if (session.lookId === "eyes") {
    eyes ??= verifiedEyes();
    ladder = await eyes;
    if (!ladder) eyes = undefined;
  } else {
    ladders ??= verifiedLadders();
    ladder = await ladders;
    if (!ladder) ladders = undefined;
  }
  if (
    ladder &&
    source.width === ladder.source.width &&
    source.height === ladder.source.height
  ) {
    round2 ??= verifiedRound2();
    const adopted = await round2;
    if (!adopted) round2 = undefined;
    round3 ??= verifiedRound3();
    const adopted3 = await round3;
    if (!adopted3) round3 = undefined;
    const targetRecords = [
      ...ladder.records,
      ...(adopted?.records.filter(
        (record) => record.purpose === "shadow_target",
      ) ?? []),
      ...(adopted3?.records ?? []),
    ];
    const attachCheckpoint = (
      record:
        | RecordedRound2Manifest["records"][number]
        | RecordedRound3Manifest["records"][number],
    ) => {
      const id = round2CheckpointAssetId(record.output.sha256);
      if (!session.assets.some((asset) => asset.id === id))
        session.assets.push({
          id,
          url: record.output.url,
          provenance: "virtual_preview",
          purpose: "preview",
          createdAt: record.generatedAt,
          recordedAt: record.generatedAt,
          providerRequestHash: record.providerRequestHash,
          width: record.output.width,
          height: record.output.height,
        });
    };
    const plans = [
      ...session.candidates,
      ...(session.activePlan ? [session.activePlan] : []),
      ...(session.adaptation ? [session.adaptation.candidate] : []),
    ];
    for (const plan of plans) {
      if (
        plan.previewJobId ||
        (plan.previewAsset && !plan.previewAsset.recordedAt)
      )
        continue;
      const selected = plan.previewVariants?.find(
        (variant) => variant.id === (plan.selectedPreviewVariantId ?? "full"),
      );
      try {
        if (selected && recipeHash(selected.recipe) !== recipeHash(plan.recipe))
          continue;
      } catch {
        continue;
      }
      for (const variant of plan.previewVariants ?? []) {
        if (
          variant.previewJobId ||
          (variant.previewAsset && !variant.previewAsset.recordedAt)
        )
          continue;
        const exact = targetRecords.find(
          (record) =>
            ("lookId" in record
              ? record.lookId === session.lookId
              : session.lookId === "eyes" && record.routeId === plan.routeId) &&
            record.level === variant.id &&
            record.recipeHash === recipeHash(variant.recipe),
        );
        if (!exact) continue;
        const key =
          "lookId" in exact
            ? `${exact.lookId}-${exact.texture}`
            : `eyes-${exact.routeId}`;
        const asset: StudioAsset = {
          id: `ladder-${key}-${exact.level}-${exact.recipeHash.slice(0, 16)}`,
          url: exact.output.url,
          provenance: "virtual_preview",
          purpose: "preview",
          createdAt: exact.generatedAt,
          recordedAt: exact.generatedAt,
          providerRequestHash: exact.providerRequestHash,
          width: exact.output.width,
          height: exact.output.height,
        };
        variant.previewStatus = "ready";
        variant.previewAsset = asset;
        delete variant.previewError;
        if (!session.assets.some((item) => item.id === asset.id))
          session.assets.push(asset);
        if (
          "purpose" in exact &&
          exact.purpose === "shadow_target" &&
          exact.level === "light"
        )
          attachCheckpoint(exact);
        if ("lookId" in exact && exact.lookId !== "eyes") {
          const firstPass = adopted?.records.find(
            (record) =>
              record.purpose === "simulated_first_pass" &&
              record.lookId === exact.lookId &&
              record.texture === exact.texture,
          );
          if (firstPass) attachCheckpoint(firstPass);
        }
      }
      if (plan.previewVariants?.length)
        selectPreviewLevel(plan, plan.selectedPreviewVariantId ?? "full");
    }
  }
  // Modern plans use the separately pinned intensity-ladder manifest. Historical
  // method recordings remain available only to their original recipe contracts.
  if (
    session.candidates.every((candidate) => !!candidate.previewVariants?.length)
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
