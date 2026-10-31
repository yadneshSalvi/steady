/** Offline only: npx tsx scripts/publish-recorded-samples.ts [--publish-synthetic]. */
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { z } from "zod";
import {
  makeRecipe,
  RECIPE_REVISION,
  validateEffects,
  EffectsSchema,
} from "../src/lib/youcam/recipes";
import {
  RecordedSamplesManifestSchema,
  type RecordedSamplesManifest,
  type RecordedSample,
} from "../src/lib/youcam/recorded";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = "public/images/studio-portrait.jpg";
const LOOKS = ["rose", "terracotta", "berry"] as const;
const ROUTES = ["tap", "sweep", "sponge"] as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const SmokeManifestSchema = z.object({
  source: z.literal(SOURCE),
  sourceProvenance: z.literal("synthetic_inspiration"),
  inputSha256: digest,
  route: z.enum(ROUTES),
  tasks: z
    .array(
      z.object({
        lookId: z.enum(LOOKS),
        effects: EffectsSchema,
        state: z.enum([
          "planned",
          "submitting",
          "waiting",
          "success",
          "failed",
          "unknown_submission",
        ]),
        requestHash: digest.optional(),
        taskHash: digest.optional(),
        outputSha256: digest.optional(),
      }),
    )
    .max(3),
});

async function collect(): Promise<{
  manifest: RecordedSamplesManifest;
  files: Map<string, string>;
  missing: string[];
}> {
  const sourceBytes = await readFile(resolve(ROOT, SOURCE));
  const sourceHash = sha(sourceBytes);
  const sourceMetadata = await sharp(sourceBytes).metadata();
  const smokeRoot = resolve(ROOT, "artifacts/private/youcam-smoke");
  const files = new Map<string, string>();
  const records = new Map<string, RecordedSample>();
  for (const directory of (await readdir(smokeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const root = resolve(smokeRoot, directory.name);
    let parsed: z.infer<typeof SmokeManifestSchema>;
    try {
      parsed = SmokeManifestSchema.parse(
        JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")),
      );
    } catch {
      continue;
    }
    if (parsed.inputSha256 !== sourceHash) continue;
    for (const task of parsed.tasks) {
      const key = `${task.lookId}-${parsed.route}`;
      if (
        records.has(key) ||
        task.state !== "success" ||
        !task.requestHash ||
        !task.taskHash ||
        !task.outputSha256
      )
        continue;
      const recipe = validateEffects(task.effects);
      if (
        JSON.stringify(recipe) !==
        JSON.stringify(makeRecipe(task.lookId, parsed.route, false))
      )
        continue;
      for (const extension of ["png", "jpg"] as const) {
        const path = resolve(root, `${key}-virtual-preview.${extension}`);
        let bytes: Buffer;
        try {
          bytes = await readFile(path);
        } catch {
          continue;
        }
        if (sha(bytes) !== task.outputSha256) continue;
        const metadata = await sharp(bytes).metadata();
        if (
          metadata.format !== (extension === "png" ? "png" : "jpeg") ||
          !metadata.width ||
          !metadata.height
        )
          continue;
        const outputUrl = `/examples/previews/${key}.${extension}`;
        records.set(key, {
          lookId: task.lookId,
          routeId: parsed.route,
          includeLips: false,
          recipe: recipe as RecordedSample["recipe"],
          recipeHash: sha(JSON.stringify(recipe)),
          inputSha256: sourceHash,
          providerRequestHash: task.requestHash,
          taskHash: task.taskHash,
          generatedAt: (await stat(path)).mtime.toISOString(),
          output: {
            url: outputUrl,
            sha256: task.outputSha256,
            width: metadata.width,
            height: metadata.height,
            provenance: "virtual_preview",
          },
        });
        files.set(outputUrl, path);
        break;
      }
    }
  }
  const keys = LOOKS.flatMap((look) =>
    ROUTES.map((route) => `${look}-${route}`),
  );
  const manifest: RecordedSamplesManifest = {
    schemaVersion: 1,
    recipeRevision: RECIPE_REVISION,
    evidenceClass: "recorded_live_youcam_on_synthetic_source",
    source: {
      assetId: "sample-portrait-v1",
      url: "/images/studio-portrait.jpg",
      sha256: sourceHash,
      width: sourceMetadata.width!,
      height: sourceMetadata.height!,
      provenance: "synthetic_inspiration",
    },
    records: keys.flatMap((key) =>
      records.has(key) ? [records.get(key)!] : [],
    ),
  };
  return { manifest, files, missing: keys.filter((key) => !records.has(key)) };
}

try {
  if (process.argv.slice(2).some((arg) => arg !== "--publish-synthetic"))
    throw new Error("Unsupported publisher option.");
  const result = await collect();
  if (!process.argv.includes("--publish-synthetic")) {
    console.log(
      JSON.stringify({
        state: "inventory",
        complete: !result.missing.length,
        verifiedRecords: result.manifest.records.length,
        missing: result.missing,
        networkRequests: 0,
      }),
    );
  } else {
    const manifest = RecordedSamplesManifestSchema.parse(result.manifest);
    const outputRoot = resolve(ROOT, "public/examples");
    await mkdir(resolve(outputRoot, "previews"), { recursive: true });
    for (const [url, path] of result.files) {
      const destination = resolve(ROOT, "public", url.slice(1));
      await copyFile(path, destination);
      await chmod(destination, 0o644);
    }
    const json = JSON.stringify(manifest, null, 2);
    const temporary = resolve(outputRoot, "recorded-samples.json.tmp");
    await writeFile(temporary, json, { mode: 0o644 });
    await rename(temporary, resolve(outputRoot, "recorded-samples.json"));
    await writeFile(
      resolve(ROOT, "src/lib/youcam/recorded-integrity.ts"),
      `/** Generated from the verified public manifest by publish-recorded-samples.ts. */\nexport const RECORDED_MANIFEST_SHA256: string = "${sha(json)}";\n`,
    );
    console.log(
      JSON.stringify({
        state: "published_local_files",
        records: manifest.records.length,
        provenance: "virtual_preview",
        sourceProvenance: "synthetic_inspiration",
        physicalOutcomes: 0,
        networkRequests: 0,
      }),
    );
  }
} catch {
  console.error(
    JSON.stringify({
      state: "not_published",
      reason:
        "The complete source, recipe and output hashes must verify before publishing.",
      networkRequests: 0,
    }),
  );
  process.exitCode = 1;
}
