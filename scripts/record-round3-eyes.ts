/** Explicit R3 eye targets only. Dry-run prepares a private ledger; no automatic retry.
 * Live: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/record-round3-eyes.ts --confirm-live --jobs=<approved IDs>
 */
import nextEnv from "@next/env";
import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import type { MakeupEffect } from "../src/lib/contracts";
import catalog from "../src/lib/youcam/fixtures/round2-patterns.json" with { type: "json" };
import { validateEffects } from "../src/lib/youcam/recipes";

nextEnv.loadEnvConfig(process.cwd());
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const directory = resolve("artifacts/private/review-round3/eyes-v3");
const ledgerPath = resolve(directory, "ledger.json");
const SOURCE_HASH =
  "ab3cb20c55f3b4a7046b5b9b72eceef3376370070426a28bef009caaf7b932cd";
const smoothing = {
  category: "skin_smooth",
  skinSmoothStrength: 0,
  skinSmoothColorIntensity: 0,
};

type Plan = {
  id: string;
  purpose: "simulated_first_pass" | "shadow_target";
  phase: "pilot" | "after_inspection";
  estimatedUnits: 1;
  recipe: MakeupEffect[];
};
type Task = Plan & {
  state: "planned" | "submitting" | "waiting" | "succeeded" | "failed";
  attempts: 0 | 1;
  submittedAt?: string;
  taskId?: string;
  taskHash?: string;
  requestHash?: string;
  outputFile?: string;
  outputSha256?: string;
  width?: number;
  height?: number;
  completedAt?: string;
};
type Ledger = {
  schemaVersion: 1;
  sourceHash: string;
  sourceWidth: number;
  sourceHeight: number;
  catalogExcerptHash: string;
  planHash: string;
  initialBalance?: number;
  latestBalance?: number;
  tasks: Task[];
};

const plans: Plan[] = ([35, 65] as const).map((intensity): Plan => ({
  id: intensity === 35 ? "shadow-light-warm-v3" : "shadow-full-warm-v3",
  purpose: "shadow_target",
  phase: "pilot",
  estimatedUnits: 1,
  recipe: validateEffects([
    smoothing,
    {
      category: "eye_shadow",
      pattern: { name: catalog.patterns.eye_shadow.label },
      palettes: [
        { color: "#805036", texture: "matte", colorIntensity: intensity },
      ],
    },
  ]),
}));

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--confirm-live");
  if (
    args.some((arg) => arg !== "--confirm-live" && !arg.startsWith("--jobs="))
  )
    throw new Error("Unsupported recording option.");
  const jobsArg = args.find((arg) => arg.startsWith("--jobs="));
  const chosen = jobsArg?.slice("--jobs=".length).split(",") ?? [];
  if (
    (live && !chosen.length) ||
    new Set(chosen).size !== chosen.length ||
    chosen.some((id) => !plans.some((plan) => plan.id === id))
  )
    throw new Error(
      "Live recording needs an explicit, unique approved job list.",
    );

  const source = await readFile(resolve("public/images/studio-portrait.jpg"));
  if (hash(source) !== SOURCE_HASH)
    throw new Error("The approved source changed.");
  const info = await sharp(source).metadata();
  const catalogBytes = await readFile(
    resolve("src/lib/youcam/fixtures/round2-patterns.json"),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = resolve(directory, "recording.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    let ledger: Ledger;
    try {
      ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw new Error(
          "Unreadable ledger: reconcile it before any provider request.",
        );
      ledger = {
        schemaVersion: 1,
        sourceHash: SOURCE_HASH,
        sourceWidth: info.width!,
        sourceHeight: info.height!,
        catalogExcerptHash: hash(catalogBytes),
        planHash: hash(JSON.stringify(plans)),
        tasks: plans.map((plan) => ({
          ...plan,
          state: "planned",
          attempts: 0,
        })),
      };
    }
    if (
      ledger.sourceHash !== SOURCE_HASH ||
      ledger.planHash !== hash(JSON.stringify(plans)) ||
      ledger.catalogExcerptHash !== hash(catalogBytes) ||
      ledger.tasks.length !== plans.length ||
      ledger.tasks.some(
        (task, index) =>
          task.id !== plans[index].id ||
          JSON.stringify(validateEffects(task.recipe)) !==
            JSON.stringify(plans[index].recipe) ||
          !["planned", "submitting", "waiting", "succeeded", "failed"].includes(
            task.state,
          ) ||
          task.attempts !== (task.state === "planned" ? 0 : 1),
      )
    )
      throw new Error("The approved ledger, source or recipe plan changed.");

    const persist = async () => {
      const temporary = `${ledgerPath}.tmp`;
      const file = await open(temporary, "w", 0o600);
      try {
        await file.writeFile(JSON.stringify(ledger, null, 2) + "\n");
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, ledgerPath);
    };
    await persist();
    if (!live) {
      console.log(
        JSON.stringify(
          {
            mode: "dry_run",
            providerRequests: 0,
            maxUnits: 2,
            ledger: "artifacts/private/review-round3/eyes-v3/ledger.json",
            plans,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (
      ledger.tasks.some(
        (task) => task.state === "submitting" || task.state === "failed",
      )
    )
      throw new Error(
        "A prior submission needs reconciliation; no new POST was made.",
      );
    const selected = ledger.tasks.filter((task) => chosen.includes(task.id));
    const waiting = selected.filter((task) => task.state === "waiting");
    if (waiting.some((task) => !task.taskId))
      throw new Error("Stored task identity is missing.");
    const provider = await import("../src/lib/youcam/index");
    const balance = await provider.getCreditBalance();
    const planned = selected.filter((task) => task.state === "planned");
    if (balance - planned.length < 700)
      throw new Error("Recording would breach the reserve.");
    ledger.initialBalance ??= balance;
    ledger.latestBalance = balance;
    await persist();
    const uploaded = planned.length
      ? await provider.uploadFile({
          bytes: source,
          contentType: "image/jpeg",
          fileName: "steady-r3-synthetic-source.jpg",
        })
      : undefined;
    for (const task of selected) {
      if (task.state === "succeeded") continue;
      if (task.state === "planned") {
        task.state = "submitting";
        task.attempts = 1;
        task.submittedAt = new Date().toISOString();
        task.requestHash = hash(
          JSON.stringify({
            src_file_id: uploaded!.fileId,
            version: "1.0",
            effects: task.recipe,
          }),
        );
        await persist();
        const submitted = await provider.submitMakeupTask({
          fileId: uploaded!.fileId,
          effects: task.recipe,
        });
        task.taskId = submitted.taskId;
        task.taskHash = hash(submitted.taskId);
        task.state = "waiting";
        await persist();
      }
      let finished = false;
      for (let poll = 0; poll < 60; poll++) {
        await delay(5000);
        const result = await provider.getMakeupTask(task.taskId!);
        if (result.state === "running") continue;
        if (result.state === "error") {
          task.state = "failed";
          await persist();
          throw new Error(
            "Definitive provider failure: task will not be resubmitted.",
          );
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
          throw new Error("Recorded output could not be retrieved.");
        const output = Buffer.from(await response.arrayBuffer());
        if (output.length > 10000000)
          throw new Error("Recorded output is too large.");
        const metadata = await sharp(output).metadata();
        if (
          !["png", "jpeg"].includes(metadata.format ?? "") ||
          metadata.width !== info.width ||
          metadata.height !== info.height
        )
          throw new Error(
            "Recorded output does not preserve the source dimensions.",
          );
        task.outputFile = `${task.id}.${metadata.format === "png" ? "png" : "jpg"}`;
        await writeFile(resolve(directory, task.outputFile), output, {
          mode: 0o600,
        });
        task.outputSha256 = hash(output);
        task.width = metadata.width;
        task.height = metadata.height;
        task.completedAt = new Date().toISOString();
        task.state = "succeeded";
        await persist();
        console.log(
          JSON.stringify({
            id: task.id,
            state: task.state,
            attempts: task.attempts,
            outputSha256: task.outputSha256,
          }),
        );
        finished = true;
        break;
      }
      if (!finished)
        throw new Error("Polling deadline: resume this stored task only.");
    }
    ledger.latestBalance = await provider.getCreditBalance();
    await persist();
    console.log(
      JSON.stringify({
        state: "selected_tasks_complete",
        selected: chosen,
        initialBalance: ledger.initialBalance,
        latestBalance: ledger.latestBalance,
        attempted: ledger.tasks.filter((task) => task.attempts === 1).length,
      }),
    );
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

await main().catch(() => {
  console.error(
    "Recording paused. Inspect the private ledger; never resubmit an uncertain task.",
  );
  process.exitCode = 1;
});
