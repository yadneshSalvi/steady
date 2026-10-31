/** Four explicit, resumable eye recordings on the fixed synthetic portrait. */
import nextEnv from "@next/env";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { makeRecipe, validateEffects } from "../src/lib/youcam/recipes";
import { RecordedEyesManifestSchema } from "../src/lib/youcam/eye-recorded";
import type { MakeupEffect } from "../src/lib/contracts";
nextEnv.loadEnvConfig(process.cwd());
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const root = resolve("artifacts/private/review-eyes"),
  path = resolve(root, "manifest.json");
const args = process.argv.slice(2),
  live = args.includes("--confirm-live"),
  publish = args.includes("--publish-synthetic");
if (
  args.some((arg) => !["--confirm-live", "--publish-synthetic"].includes(arg))
)
  throw new Error("Unsupported option.");
type Task = {
  routeId: "liner" | "shadow";
  level: "light" | "full";
  intensity: 25 | 65;
  recipe: MakeupEffect[];
  state: "planned" | "submitting" | "waiting" | "success" | "failed";
  taskId?: string;
  taskHash?: string;
  providerRequestHash?: string;
  outputFile?: string;
  outputSha256?: string;
  generatedAt?: string;
  width?: number;
  height?: number;
};
type Manifest = {
  sourceHash: string;
  initialBalance: number;
  finalBalance?: number;
  tasks: Task[];
};
const planned: Task[] = (["liner", "shadow"] as const).flatMap((routeId) =>
  ([25, 65] as const).map((intensity) => ({
    routeId,
    intensity,
    level: intensity === 25 ? "light" : "full",
    recipe: makeRecipe("eyes", routeId, false, intensity),
    state: "planned",
  })),
);
const bytes = await readFile(resolve("public/images/studio-portrait.jpg")),
  metadata = await sharp(bytes).metadata();
let manifest: Manifest | undefined;
try {
  manifest = JSON.parse(await readFile(path, "utf8"));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
    throw new Error(
      "The recording ledger is unreadable. No task was submitted; reconcile the saved ledger first.",
    );
}
if (
  manifest &&
  (manifest.sourceHash !== sha(bytes) ||
    manifest.tasks.length !== 4 ||
    manifest.tasks.some(
      (task, index) =>
        JSON.stringify(validateEffects(task.recipe)) !==
        JSON.stringify(planned[index].recipe),
    ))
)
  throw new Error("The exact recording source or recipes changed.");
const persist = () =>
  writeFile(path, JSON.stringify(manifest, null, 2), { mode: 0o600 });
if (!live && !publish)
  console.log(
    JSON.stringify(
      {
        state: "dry_run",
        estimatedUnits: 4,
        providerRequests: 0,
        recipes: planned.map(({ routeId, level, recipe }) => ({
          routeId,
          level,
          recipe,
          recipeHash: sha(JSON.stringify(recipe)),
        })),
      },
      null,
      2,
    ),
  );
if (live) {
  const provider = await import("../src/lib/youcam/index");
  if (
    manifest?.tasks.some(
      (task) => task.state === "submitting" || task.state === "failed",
    )
  )
    throw new Error(
      "A prior submission needs reconciliation. No automatic retry.",
    );
  const balance = await provider.getCreditBalance();
  const remaining = (manifest?.tasks ?? planned).filter(
    (task) => task.state === "planned",
  ).length;
  if (balance - remaining < 700)
    throw new Error("Recording would breach the judge reserve.");
  if (!manifest) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    manifest = {
      sourceHash: sha(bytes),
      initialBalance: balance,
      tasks: planned,
    };
    await persist();
  }
  const fileId = remaining
    ? (
        await provider.uploadFile({
          bytes,
          contentType: "image/jpeg",
          fileName: "steady-synthetic-eyes.jpg",
        })
      ).fileId
    : undefined;
  for (const task of manifest.tasks) {
    if (task.state === "success") continue;
    if (task.state === "planned") {
      task.state = "submitting";
      task.providerRequestHash = sha(
        JSON.stringify({
          src_file_id: fileId,
          version: "1.0",
          effects: task.recipe,
        }),
      );
      await persist();
      const submitted = await provider.submitMakeupTask({
        fileId: fileId!,
        effects: task.recipe,
      });
      task.taskId = submitted.taskId;
      task.taskHash = sha(submitted.taskId);
      task.state = "waiting";
      await persist();
    }
    if (!task.taskId || task.state !== "waiting")
      throw new Error("Unknown submission state.");
    let complete = false;
    for (let poll = 0; poll < 60; poll++) {
      await delay(5000);
      const result = await provider.getMakeupTask(task.taskId);
      if (result.state === "running") continue;
      if (result.state === "error") {
        task.state = "failed";
        await persist();
        throw new Error("Provider task failed; no resubmission.");
      }
      const response = await fetch(result.outputUrl, {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (
        !response.ok ||
        Number(response.headers.get("content-length") ?? 0) > 10000000
      )
        throw new Error("Output unavailable.");
      const output = Buffer.from(await response.arrayBuffer());
      if (output.length > 10000000) throw new Error("Output too large.");
      const info = await sharp(output).metadata();
      if (
        !["png", "jpeg"].includes(info.format ?? "") ||
        info.width !== metadata.width ||
        info.height !== metadata.height
      )
        throw new Error("Output is not aligned with the source.");
      task.outputFile = `${task.routeId}-${task.level}.${info.format === "png" ? "png" : "jpg"}`;
      await writeFile(resolve(root, task.outputFile), output, { mode: 0o600 });
      task.outputSha256 = sha(output);
      task.generatedAt = new Date().toISOString();
      task.width = info.width;
      task.height = info.height;
      task.state = "success";
      await persist();
      console.log(
        JSON.stringify({
          state: "recorded",
          route: task.routeId,
          level: task.level,
          completed: manifest.tasks.filter((item) => item.state === "success")
            .length,
          total: 4,
        }),
      );
      complete = true;
      break;
    }
    if (!complete)
      throw new Error("Polling deadline: resume the stored task ID only.");
  }
  manifest.finalBalance = await provider.getCreditBalance();
  await persist();
  console.log(
    JSON.stringify({
      state: "recording_complete",
      initialBalance: manifest.initialBalance,
      finalBalance: manifest.finalBalance,
      observedSpend: manifest.initialBalance - manifest.finalBalance,
    }),
  );
}
if (publish) {
  if (!manifest || manifest.tasks.some((task) => task.state !== "success"))
    throw new Error("All four recordings must verify before publishing.");
  const output = RecordedEyesManifestSchema.parse({
    schemaVersion: 1,
    evidenceClass: "recorded_live_youcam_on_synthetic_source",
    source: {
      assetId: "sample-portrait-v1",
      url: "/images/studio-portrait.jpg",
      sha256: sha(bytes),
      width: metadata.width,
      height: metadata.height,
    },
    records: manifest.tasks.map((task) => ({
      routeId: task.routeId,
      level: task.level,
      intensity: task.intensity,
      recipe: task.recipe,
      recipeHash: sha(JSON.stringify(validateEffects(task.recipe))),
      inputSha256: manifest!.sourceHash,
      providerRequestHash: task.providerRequestHash,
      taskHash: task.taskHash,
      generatedAt: task.generatedAt,
      output: {
        url: `/examples/eyes/${task.outputFile}`,
        sha256: task.outputSha256,
        width: task.width,
        height: task.height,
        provenance: "virtual_preview",
      },
    })),
  });
  await mkdir(resolve("public/examples/eyes"), { recursive: true });
  for (const task of manifest.tasks) {
    const file = await readFile(resolve(root, task.outputFile!));
    if (sha(file) !== task.outputSha256)
      throw new Error("Output hash mismatch.");
    await writeFile(resolve("public/examples/eyes", task.outputFile!), file, {
      mode: 0o644,
    });
  }
  const raw = JSON.stringify(output, null, 2);
  await writeFile(resolve("public/examples/recorded-eyes.json"), raw);
  await writeFile(
    resolve("src/lib/youcam/eye-integrity.ts"),
    `/** Exact source, recipe and output hashes from record-eyes.ts. */\nexport const RECORDED_EYES_MANIFEST_SHA256:string="${sha(raw)}";\n`,
  );
  console.log(
    JSON.stringify({
      state: "published_synthetic_recordings",
      records: 4,
      manifestHash: sha(raw),
    }),
  );
}
