/** Offline publication only. Provider submission belongs to the resumable recorders. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { format } from "prettier";
import sharp from "sharp";
import { z } from "zod";
import { EffectsSchema } from "../src/lib/youcam/recipes";
import { RecordedRound2ManifestSchema } from "../src/lib/youcam/round2-recorded";

const root = process.cwd();
const primaryDir = join(root, "artifacts/private/review-round2/recordings");
const revisedDir = join(root, "artifacts/private/review-round2/eye-revision");
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const TaskSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  recipe: EffectsSchema,
  state: z.literal("succeeded"),
  attempts: z.literal(1),
  taskId: z.string().min(1),
  taskHash: digest,
  requestHash: digest,
  outputFile: z.string().regex(/^[a-z0-9-]+\.png$/),
  outputSha256: digest,
  completedAt: z.string().datetime(),
  width: z.literal(1024),
  height: z.literal(1280),
});
const LedgerSchema = z.object({
  sourceHash: digest,
  sourceWidth: z.literal(1024),
  sourceHeight: z.literal(1280),
  catalogExcerptHash: digest,
  tasks: z.array(TaskSchema),
});
const [primary, revised, source, excerpt] = await Promise.all([
  readFile(join(primaryDir, "ledger.json"), "utf8").then((raw) =>
    LedgerSchema.parse(JSON.parse(raw)),
  ),
  readFile(join(revisedDir, "ledger.json"), "utf8").then((raw) =>
    LedgerSchema.parse(JSON.parse(raw)),
  ),
  readFile(join(root, "public/images/studio-portrait.jpg")),
  readFile(join(root, "src/lib/youcam/fixtures/round2-patterns.json")),
]);
for (const ledger of [primary, revised]) {
  if (
    ledger.sourceHash !== sha(source) ||
    ledger.catalogExcerptHash !== sha(excerpt)
  )
    throw new Error(
      "Source or catalog changed after the recording ledger was created.",
    );
}
const selections = [
  ...primary.tasks
    .filter((task) => task.id.startsWith("blush-"))
    .map((task) => ({ task, directory: primaryDir })),
  ...revised.tasks.map((task) => ({ task, directory: revisedDir })),
];
const outputs = await Promise.all(
  selections.map(async ({ task, directory }) => {
    if (
      task.outputFile !== `${task.id}.png` ||
      sha(task.taskId) !== task.taskHash
    )
      throw new Error(`Invalid ledger identity for ${task.id}.`);
    const bytes = await readFile(join(directory, task.outputFile));
    const metadata = await sharp(bytes).metadata();
    if (
      sha(bytes) !== task.outputSha256 ||
      metadata.width !== 1024 ||
      metadata.height !== 1280
    )
      throw new Error(`Output bytes or dimensions changed for ${task.id}.`);
    const blush = task.id.startsWith("blush-");
    const [, family, texture] = task.id.split("-");
    const level = blush
      ? "first_pass"
      : task.id.includes("-light-")
        ? "light"
        : "full";
    return {
      bytes,
      record: {
        id: task.id,
        purpose: blush ? "simulated_first_pass" : "shadow_target",
        lookId: blush ? family : "eyes",
        texture: blush ? texture : "matte",
        level,
        intensity: level === "light" ? 25 : 45,
        recipe: task.recipe,
        recipeHash: sha(JSON.stringify(task.recipe)),
        inputSha256: sha(source),
        providerRequestHash: task.requestHash,
        taskHash: task.taskHash,
        attempts: task.attempts,
        generatedAt: task.completedAt,
        output: {
          url: `/examples/round2/${task.id}.png`,
          sha256: task.outputSha256,
          width: 1024,
          height: 1280,
          provenance: "virtual_preview",
        },
      },
    };
  }),
);
const manifest = RecordedRound2ManifestSchema.parse({
  schemaVersion: 1,
  recipeRevision: 4,
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
  records: outputs.map(({ record }) => record),
});

async function writeNewOrIdentical(path: string, bytes: Uint8Array | string) {
  let existing: Buffer | undefined;
  try {
    existing = await readFile(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  if (existing) {
    if (sha(existing) !== sha(bytes))
      throw new Error(`Refusing to rewrite published file ${path}.`);
    return;
  }
  await writeFile(path, bytes, { flag: "wx" });
}
await mkdir(join(root, "public/examples/round2"), { recursive: true });
for (const { bytes, record } of outputs)
  await writeNewOrIdentical(
    join(root, "public", record.output.url.slice(1)),
    bytes,
  );
const manifestText = await format(JSON.stringify(manifest), { parser: "json" });
await writeNewOrIdentical(
  join(root, "public/examples/recorded-round2.json"),
  manifestText,
);
await writeNewOrIdentical(
  join(root, "src/lib/youcam/round2-integrity.ts"),
  `/** Immutable public R2 catalog; original provider output bytes are preserved. */\nexport const RECORDED_ROUND2_MANIFEST_SHA256 =\n  "${sha(manifestText)}";\n`,
);
console.log(
  JSON.stringify({
    adoptedRecords: manifest.records.length,
    manifestSha256: sha(manifestText),
    paidCalls: 0,
  }),
);
