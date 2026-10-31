/**
 * Dry run (no network): npx tsx scripts/smoke-youcam.ts
 * Explicit live opt-in, after reviewing the recipe and shared credit budget:
 * NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/smoke-youcam.ts --confirm-live --look rose
 * Add --all-looks for at most three sequential renders, within a 3-unit estimate.
 * Resume only stored task IDs with --resume artifacts/private/youcam-smoke/<run>/manifest.json.
 * Outputs and recovery metadata stay in the ignored private directory. No signed
 * URL, raw response, credential or participant result is printed or published.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import type { CandidatePlan, LookId, MakeupEffect } from "../src/lib/contracts";
import { makeRecipe, validateEffects } from "../src/lib/youcam/recipes";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PRIVATE_ROOT = resolve(ROOT, "artifacts/private/youcam-smoke");
const SOURCE = "public/images/studio-portrait.jpg";
const UNIT_CAP = 3;
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

export function parseSmokeArgs(
  args: string[],
  envOptIn?: string,
): {
  live: boolean;
  looks: LookId[];
  route: CandidatePlan["routeId"];
  resume?: string;
} {
  let live = envOptIn === "1";
  let looks: LookId[] = ["rose"];
  let route: CandidatePlan["routeId"] = "tap";
  let resume: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--confirm-live") live = true;
    else if (arg === "--all-looks") looks = ["rose", "terracotta", "berry"];
    else if (
      arg === "--look" &&
      ["rose", "terracotta", "berry"].includes(args[index + 1])
    )
      looks = [args[++index] as LookId];
    else if (
      arg === "--route" &&
      ["tap", "sweep", "sponge"].includes(args[index + 1])
    )
      route = args[++index] as CandidatePlan["routeId"];
    else if (arg === "--resume" && args[index + 1]) resume = args[++index];
    else throw new Error("Invalid smoke-test option.");
  }
  return { live, looks, route, resume };
}

interface SmokeTask {
  lookId: LookId;
  effects: MakeupEffect[];
  requestHash?: string;
  state:
    | "planned"
    | "submitting"
    | "waiting"
    | "success"
    | "failed"
    | "unknown_submission";
  taskId?: string;
  taskHash?: string;
  polls: number;
  outputSha256?: string;
  errorCode?: string;
}
interface Manifest {
  schemaVersion: 1;
  createdAt: string;
  source: typeof SOURCE;
  sourceProvenance: "synthetic_inspiration";
  inputSha256: string;
  route: CandidatePlan["routeId"];
  estimatedUnits: number;
  observedSpend: null;
  tasks: SmokeTask[];
}

async function persist(path: string, manifest: Manifest): Promise<void> {
  await writeFile(path, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  // This companion is safe to inspect: task IDs and all transport URLs omitted.
  const evidence = {
    ...manifest,
    tasks: manifest.tasks.map((entry) => {
      const task = { ...entry };
      delete task.taskId;
      return task;
    }),
    evidenceClass: "provider_smoke_attempt_on_synthetic_input",
    physicalOutcomeAssessed: false,
    note: "A virtual preview is not actual makeup application. Estimated cost is not an observed balance change.",
  };
  await writeFile(
    resolve(dirname(path), "evidence.json"),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
}

function privateManifestPath(input: string): string {
  const path = resolve(ROOT, input);
  if (!path.startsWith(PRIVATE_ROOT + sep) || !path.endsWith("manifest.json"))
    throw new Error("Use a private smoke-test manifest.");
  return path;
}

async function downloadPrivate(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || !response.body)
    throw new Error("Output ingestion failed.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 10_000_000) {
      await reader.cancel();
      throw new Error("Output too large.");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const cli = parseSmokeArgs(args, process.env.STEADY_CONFIRM_LIVE_YOUCAM);
  const recipes = cli.looks.map((lookId) => ({
    lookId,
    effects: validateEffects(makeRecipe(lookId, cli.route, false)),
  }));
  if (!cli.live) {
    console.log(
      JSON.stringify(
        {
          state: "dry_run",
          providerRequests: 0,
          source: SOURCE,
          sourceProvenance: "synthetic_inspiration",
          recipes,
          estimatedUnitCap: UNIT_CAP,
          optIn: "--confirm-live or STEADY_CONFIRM_LIVE_YOUCAM=1",
        },
        null,
        2,
      ),
    );
    return 0;
  }
  // server-only is intentionally retained in the real adapter. The documented
  // Node react-server condition lets this explicitly authorized script import it.
  const provider = await import("../src/lib/youcam/index");
  let manifest: Manifest;
  let manifestPath: string;
  if (cli.resume) {
    manifestPath = privateManifestPath(cli.resume);
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
    if (
      manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.tasks) ||
      manifest.tasks.length > 3 ||
      manifest.source !== SOURCE
    )
      throw new Error("Invalid recovery manifest.");
    for (const task of manifest.tasks) {
      validateEffects(task.effects);
      if (
        task.state !== "success" &&
        (!task.taskId || task.state !== "waiting")
      )
        throw new Error(
          "An unconfirmed submission cannot be automatically resumed or submitted again.",
        );
    }
  } else {
    const costs = [];
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await provider.getFeatureCosts({
        pageSize: 20,
        startingToken: token,
      });
      costs.push(
        ...result.skus.filter(
          (sku) =>
            new URL(sku.runTaskUrl).pathname === "/s2s/v2.0/task/makeup-vto" &&
            sku.unit === "result_image",
        ),
      );
      if (!result.nextToken) break;
      token = result.nextToken;
    }
    if (!costs.length)
      throw new Error("Could not establish the current makeup feature cost.");
    const estimatedUnits =
      Math.max(
        ...costs.map((sku) => sku.amount * Math.ceil(1 / sku.procUnit)),
      ) * recipes.length;
    if (!(estimatedUnits > 0) || estimatedUnits > UNIT_CAP)
      throw new Error("Estimated usage exceeds the smoke-test cap.");
    // The sample reader submits these same original bytes. Re-encoding here
    // would produce a different input hash and break exact recorded replay.
    const bytes = await readFile(resolve(ROOT, SOURCE));
    const sourceMetadata = await sharp(bytes, {
      limitInputPixels: 4_000_000,
    }).metadata();
    if (
      sourceMetadata.format !== "jpeg" ||
      !sourceMetadata.width ||
      !sourceMetadata.height ||
      Math.max(sourceMetadata.width, sourceMetadata.height) >= 1920
    )
      throw new Error(
        "The fixed synthetic source needs a supported original JPEG under 1920 pixels on its long side.",
      );
    const directory = resolve(
      PRIVATE_ROOT,
      new Date().toISOString().replace(/[:.]/g, "-"),
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    manifestPath = resolve(directory, "manifest.json");
    manifest = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      source: SOURCE,
      sourceProvenance: "synthetic_inspiration",
      inputSha256: hash(bytes),
      route: cli.route,
      estimatedUnits,
      observedSpend: null,
      tasks: recipes.map((recipe) => ({
        ...recipe,
        state: "planned",
        polls: 0,
      })),
    };
    await persist(manifestPath, manifest);
    await writeFile(resolve(directory, "prepared-source.jpg"), bytes, {
      mode: 0o600,
    });
    const { fileId } = await provider.uploadFile({
      bytes,
      contentType: "image/jpeg",
      fileName: "steady-synthetic-smoke.jpg",
    });
    for (const task of manifest.tasks) {
      task.state = "submitting";
      task.requestHash = hash(
        JSON.stringify({
          src_file_id: fileId,
          version: "1.0",
          effects: task.effects,
        }),
      );
      await persist(manifestPath, manifest);
      try {
        const submitted = await provider.submitMakeupTask({
          fileId,
          effects: task.effects,
        });
        task.taskId = submitted.taskId;
        task.taskHash = hash(submitted.taskId);
        task.state = "waiting";
      } catch (error) {
        task.state =
          error instanceof provider.YouCamError && error.submissionUncertain
            ? "unknown_submission"
            : "failed";
        task.errorCode =
          error instanceof provider.YouCamError
            ? error.code
            : "submission_failed";
        await persist(manifestPath, manifest);
        throw error;
      }
      await persist(manifestPath, manifest);
    }
  }
  console.log(
    JSON.stringify({
      state: "polling",
      manifest: relative(ROOT, manifestPath),
      tasks: manifest.tasks.length,
      estimatedUnits: manifest.estimatedUnits,
    }),
  );
  for (const task of manifest.tasks) {
    if (task.state === "success") continue;
    for (let attempt = 0; attempt < 36; attempt++) {
      await delay(10_000);
      task.polls++;
      let state: Awaited<ReturnType<typeof provider.getMakeupTask>>;
      try {
        state = await provider.getMakeupTask(task.taskId!);
      } catch (error) {
        if (error instanceof provider.YouCamError && error.retryable) {
          await persist(manifestPath, manifest);
          continue;
        }
        throw error;
      }
      await persist(manifestPath, manifest);
      if (state.state === "running") continue;
      if (state.state === "error") {
        task.state = "failed";
        task.errorCode = state.code;
        await persist(manifestPath, manifest);
        console.log(
          JSON.stringify({
            look: task.lookId,
            state: "failed",
            code: state.code,
          }),
        );
        return 1;
      }
      const output = await downloadPrivate(state.outputUrl);
      const metadata = await sharp(output).metadata();
      if (metadata.format !== "jpeg" && metadata.format !== "png")
        throw new Error("Unexpected output format.");
      await writeFile(
        resolve(
          dirname(manifestPath),
          `${task.lookId}-${manifest.route}-virtual-preview.${metadata.format === "jpeg" ? "jpg" : "png"}`,
        ),
        output,
        { mode: 0o600 },
      );
      task.outputSha256 = hash(output);
      task.state = "success";
      await persist(manifestPath, manifest);
      console.log(
        JSON.stringify({
          look: task.lookId,
          state: "success",
          provenance: "virtual_preview",
          physicalOutcomeAssessed: false,
        }),
      );
      break;
    }
    if (task.state !== "success") return 2;
  }
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const code =
        typeof error === "object" &&
        error &&
        "code" in error &&
        typeof error.code === "string" &&
        /^[a-z_]{1,64}$/.test(error.code)
          ? error.code
          : "smoke_failed";
      console.error(
        JSON.stringify({
          state: "halted",
          code,
          message:
            "No automatic task resubmission occurred. Inspect the private manifest before another live run.",
        }),
      );
      process.exitCode = 1;
    });
}
