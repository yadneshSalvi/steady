/** Offline adoption of the approved pair. Never calls the provider. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { format } from "prettier";
import sharp from "sharp";
import { z } from "zod";
import { EffectsSchema } from "../src/lib/youcam/recipes";
import { RecordedRound3ManifestSchema } from "../src/lib/youcam/round3-recorded";
import { RECORDED_ROUND2_MANIFEST_SHA256 } from "../src/lib/youcam/round2-integrity";
import r1 from "../tests/fixtures/measurement-recordings-r1.json" with { type: "json" };
const root = process.cwd(),
  directory = join(root, "artifacts/private/review-round3/eyes-deeper-v4");
const sha = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const Task = z.object({
  id: z.enum(["shadow-light-warm-v4", "shadow-full-warm-v4"]),
  recipe: EffectsSchema,
  state: z.literal("succeeded"),
  attempts: z.literal(1),
  taskId: z.string().min(1),
  taskHash: digest,
  requestHash: digest,
  outputFile: z.string(),
  outputSha256: digest,
  width: z.literal(1024),
  height: z.literal(1280),
  completedAt: z.string().datetime(),
});
const Ledger = z.object({
  sourceHash: digest,
  sourceWidth: z.literal(1024),
  sourceHeight: z.literal(1280),
  catalogExcerptHash: digest,
  planHash: z.literal(
    "b5625c1c25509adb21e562f98a6dc4b10981948db4e2e486ad93128553df877e",
  ),
  tasks: z.array(Task).length(2),
});
const ledger = Ledger.parse(
  JSON.parse(await readFile(join(directory, "ledger.json"), "utf8")),
);
const source = await readFile(join(root, "public/images/studio-portrait.jpg")),
  excerpt = await readFile(
    join(root, "src/lib/youcam/fixtures/round2-patterns.json"),
  );
if (
  sha(source) !== ledger.sourceHash ||
  sha(excerpt) !== ledger.catalogExcerptHash ||
  new Set(ledger.tasks.map((task) => task.id)).size !== 2
)
  throw new Error("Approved source, catalog, or tasks changed.");
const history = new Map<string, string>();
for (const manifest of [
  ...r1.manifests,
  {
    path: "public/examples/recorded-round2.json",
    sha256: RECORDED_ROUND2_MANIFEST_SHA256,
  },
]) {
  const bytes = await readFile(join(root, manifest.path));
  if (sha(bytes) !== manifest.sha256)
    throw new Error("Historical manifest changed.");
  history.set(manifest.path, manifest.sha256);
  const prior = JSON.parse(bytes.toString()) as {
    records: { output: { url: string; sha256: string } }[];
  };
  for (const record of prior.records) {
    const path = `public${record.output.url}`,
      bytes = await readFile(join(root, path));
    if (sha(bytes) !== record.output.sha256)
      throw new Error("Historical output changed.");
    history.set(path, record.output.sha256);
  }
}
const outputs = await Promise.all(
  ledger.tasks.map(async (task) => {
    if (
      task.outputFile !== `${task.id}.png` ||
      sha(task.taskId) !== task.taskHash
    )
      throw new Error("Ledger task identity changed.");
    const bytes = await readFile(join(directory, task.outputFile)),
      metadata = await sharp(bytes).metadata();
    if (
      sha(bytes) !== task.outputSha256 ||
      metadata.format !== "png" ||
      metadata.width !== 1024 ||
      metadata.height !== 1280
    )
      throw new Error("Output bytes or dimensions changed.");
    const level = task.id.includes("-light-") ? "light" : "full";
    return {
      bytes,
      record: {
        id: task.id,
        purpose: "shadow_target",
        lookId: "eyes",
        routeId: "shadow",
        texture: "matte",
        level,
        intensity: level === "light" ? 35 : 65,
        recipe: task.recipe,
        recipeHash: sha(JSON.stringify(task.recipe)),
        inputSha256: ledger.sourceHash,
        providerRequestHash: task.requestHash,
        taskHash: task.taskHash,
        attempts: 1,
        generatedAt: task.completedAt,
        output: {
          url: `/examples/round3/${task.id}.png`,
          sha256: task.outputSha256,
          width: 1024,
          height: 1280,
          provenance: "virtual_preview",
        },
      },
    };
  }),
);
outputs.sort((a, b) =>
  a.record.level === "light" ? -1 : b.record.level === "light" ? 1 : 0,
);
const manifest = RecordedRound3ManifestSchema.parse({
  schemaVersion: 1,
  recipeRevision: 5,
  evidenceClass: "recorded_live_youcam_on_synthetic_source",
  catalogExcerptSha256: sha(excerpt),
  source: {
    assetId: "sample-portrait-v1",
    url: "/images/studio-portrait.jpg",
    sha256: sha(source),
    width: 1024,
    height: 1280,
    provenance: "synthetic_inspiration",
  },
  records: outputs.map((item) => item.record),
});
async function writeNewOrIdentical(path: string, bytes: Uint8Array | string) {
  try {
    const existing = await readFile(path);
    if (sha(existing) !== sha(bytes))
      throw new Error(`Refusing to rewrite ${path}.`);
    return;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  await writeFile(path, bytes, { flag: "wx" });
}
await mkdir(join(root, "public/examples/round3"), { recursive: true });
for (const output of outputs)
  await writeNewOrIdentical(
    join(root, `public${output.record.output.url}`),
    output.bytes,
  );
const text = await format(JSON.stringify(manifest), { parser: "json" });
await writeNewOrIdentical(
  join(root, "public/examples/recorded-round3.json"),
  text,
);
await writeNewOrIdentical(
  join(root, "src/lib/youcam/round3-integrity.ts"),
  `/** Approved immutable R3 recorded eye pair. */\nexport const RECORDED_ROUND3_MANIFEST_SHA256 =\n  "${sha(text)}";\n`,
);
for (const [path, hash] of history)
  if (sha(await readFile(join(root, path))) !== hash)
    throw new Error("Historical bytes changed during publication.");
await writeFile(
  join(root, "artifacts/private/review-round3/recording-history-hashes.json"),
  JSON.stringify(Object.fromEntries(history), null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    adoptedRecords: manifest.records.length,
    manifestSha256: sha(text),
    preservedHistoricalFiles: history.size,
    providerRequests: 0,
  }),
);
