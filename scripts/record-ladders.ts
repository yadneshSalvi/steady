/** Deliberate, resumable synthetic recording: no automatic paid POST retry. */
import nextEnv from "@next/env";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import {
  makeRecipe,
  PREVIEW_LEVELS,
  validateEffects,
} from "../src/lib/youcam/recipes";
import { RecordedLadderManifestSchema } from "../src/lib/youcam/ladder-recorded";
import type { LookId, MakeupEffect, PreviewLevel } from "../src/lib/contracts";

nextEnv.loadEnvConfig(process.cwd());
const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const privateRoot = resolve("artifacts/private/review-ladders");
const manifestPath = resolve(privateRoot, "manifest.json");
const sourcePath = resolve("public/images/studio-portrait.jpg");
type Task = {
  lookId: LookId;
  texture: "satin" | "matte";
  level: PreviewLevel;
  intensity: 25 | 45 | 65;
  recipe: MakeupEffect[];
  state: "planned" | "submitting" | "waiting" | "success" | "failed";
  taskId?: string;
  providerRequestHash?: string;
  taskHash?: string;
  outputSha256?: string;
  outputFile?: string;
  generatedAt?: string;
  width?: number;
  height?: number;
};
type PrivateManifest = {
  sourceHash: string;
  initialBalance: number;
  finalBalance?: number;
  createdAt: string;
  tasks: Task[];
};
const planned: Task[] = (["rose", "terracotta", "berry"] as const).flatMap(
  (lookId) =>
    (["satin", "matte"] as const).flatMap((texture) =>
      PREVIEW_LEVELS.map(({ id: level, intensity }) => ({
        lookId,
        texture,
        level,
        intensity,
        recipe: makeRecipe(
          lookId,
          texture === "matte" ? "sweep" : "tap",
          false,
          intensity,
        ),
        state: "planned" as const,
      })),
    ),
);
const args = process.argv.slice(2);
const live = args.includes("--confirm-live");
const publish = args.includes("--publish-synthetic");
if (
  args.some((arg) => !["--confirm-live", "--publish-synthetic"].includes(arg))
)
  throw new Error("Unsupported recording option.");
const bytes = await readFile(sourcePath);
const sourceMetadata = await sharp(bytes).metadata();
let manifest: PrivateManifest | undefined;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
    throw new Error(
      "The recording ledger is unreadable. No task was submitted; reconcile the saved ledger first.",
    );
}
if (
  manifest &&
  (manifest.sourceHash !== sha(bytes) ||
    manifest.tasks.length !== 18 ||
    manifest.tasks.some(
      (task, index) =>
        JSON.stringify(validateEffects(task.recipe)) !==
        JSON.stringify(planned[index].recipe),
    ))
)
  throw new Error(
    "Source or recipe changed: recording manifest cannot be reused.",
  );
const persist = async () =>
  writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
if (!live && !publish) {
  console.log(
    JSON.stringify(
      {
        state: "dry_run",
        estimatedUnits: 18,
        existingComplete:
          manifest?.tasks.filter((task) => task.state === "success").length ??
          0,
        sourceHash: sha(bytes),
        recipes: planned.map(
          ({ lookId, texture, level, intensity, recipe }) => ({
            lookId,
            texture,
            level,
            intensity,
            recipeHash: sha(JSON.stringify(recipe)),
          }),
        ),
        providerRequests: 0,
      },
      null,
      2,
    ),
  );
} else {
  if (live) {
    const provider = await import("../src/lib/youcam/index");
    if (
      manifest?.tasks.some(
        (task) => task.state === "submitting" || task.state === "failed",
      )
    )
      throw new Error(
        "A prior paid submission needs manual reconciliation. No retry performed.",
      );
    const balance = await provider.getCreditBalance();
    const outstanding = (manifest?.tasks ?? planned).filter(
      (task) => task.state === "planned",
    ).length;
    if (balance - outstanding < 700)
      throw new Error("The recording would breach the shared judge reserve.");
    if (!manifest) {
      await mkdir(privateRoot, { recursive: true, mode: 0o700 });
      manifest = {
        sourceHash: sha(bytes),
        initialBalance: balance,
        createdAt: new Date().toISOString(),
        tasks: planned,
      };
      await persist();
    }
    let fileId: string | undefined;
    if (outstanding)
      fileId = (
        await provider.uploadFile({
          bytes,
          contentType: "image/jpeg",
          fileName: "steady-synthetic-ladder.jpg",
        })
      ).fileId;
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
        throw new Error("Unknown submission state; no retry performed.");
      let complete = false;
      for (let poll = 0; poll < 60; poll++) {
        await delay(5000);
        const result = await provider.getMakeupTask(task.taskId);
        if (result.state === "running") continue;
        if (result.state === "error") {
          task.state = "failed";
          await persist();
          throw new Error("Provider task failed; no duplicate submitted.");
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
          throw new Error("Recorded output unavailable or too large.");
        const output = Buffer.from(await response.arrayBuffer());
        if (output.length > 10000000)
          throw new Error("Recorded output too large.");
        const metadata = await sharp(output).metadata();
        if (
          !["png", "jpeg"].includes(metadata.format ?? "") ||
          metadata.width !== sourceMetadata.width ||
          metadata.height !== sourceMetadata.height
        )
          throw new Error("Recorded output needs an aligned source size.");
        task.outputFile = `${task.lookId}-${task.texture}-${task.level}.${metadata.format === "png" ? "png" : "jpg"}`;
        await writeFile(resolve(privateRoot, task.outputFile), output, {
          mode: 0o600,
        });
        task.outputSha256 = sha(output);
        task.width = metadata.width;
        task.height = metadata.height;
        task.generatedAt = new Date().toISOString();
        task.state = "success";
        await persist();
        console.log(
          JSON.stringify({
            state: "recorded",
            look: task.lookId,
            texture: task.texture,
            level: task.level,
            completed: manifest.tasks.filter((item) => item.state === "success")
              .length,
            total: 18,
          }),
        );
        complete = true;
        break;
      }
      if (!complete)
        throw new Error(
          "Polling deadline: rerun only to resume stored task ID.",
        );
    }
    manifest.finalBalance = await provider.getCreditBalance();
    await persist();
    console.log(
      JSON.stringify({
        state: "recording_complete",
        initialBalance: manifest.initialBalance,
        finalBalance: manifest.finalBalance,
        observedSpend: manifest.initialBalance - manifest.finalBalance,
        records: 18,
      }),
    );
  }
  if (publish) {
    if (!manifest || manifest.tasks.some((task) => task.state !== "success"))
      throw new Error("Complete all exact recordings before publishing.");
    const published = RecordedLadderManifestSchema.parse({
      schemaVersion: 1,
      recipeRevision: 3,
      evidenceClass: "recorded_live_youcam_on_synthetic_source",
      source: {
        assetId: "sample-portrait-v1",
        url: "/images/studio-portrait.jpg",
        sha256: sha(bytes),
        width: sourceMetadata.width,
        height: sourceMetadata.height,
      },
      records: manifest.tasks.map((task) => ({
        lookId: task.lookId,
        texture: task.texture,
        level: task.level,
        intensity: task.intensity,
        recipe: task.recipe,
        recipeHash: sha(JSON.stringify(validateEffects(task.recipe))),
        inputSha256: manifest!.sourceHash,
        providerRequestHash: task.providerRequestHash,
        taskHash: task.taskHash,
        generatedAt: task.generatedAt,
        output: {
          url: `/examples/ladder/${task.outputFile}`,
          sha256: task.outputSha256,
          width: task.width,
          height: task.height,
          provenance: "virtual_preview",
        },
      })),
    });
    await mkdir(resolve("public/examples/ladder"), { recursive: true });
    for (const task of manifest.tasks) {
      const output = await readFile(resolve(privateRoot, task.outputFile!));
      if (sha(output) !== task.outputSha256)
        throw new Error("Output hash mismatch.");
      await writeFile(
        resolve("public/examples/ladder", task.outputFile!),
        output,
        { mode: 0o644 },
      );
    }
    const raw = JSON.stringify(published, null, 2);
    await writeFile(resolve("public/examples/recorded-ladders.json"), raw);
    await writeFile(
      resolve("src/lib/youcam/ladder-integrity.ts"),
      `/** Verified source/recipe/output manifest, generated by record-ladders.ts. */\nexport const RECORDED_LADDER_MANIFEST_SHA256: string = "${sha(raw)}";\n`,
    );
    console.log(
      JSON.stringify({
        state: "published_synthetic_recordings",
        records: 18,
        manifestHash: sha(raw),
        networkRequests: live ? undefined : 0,
      }),
    );
  }
}
