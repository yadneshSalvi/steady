/** Explicit opt-in live AI evaluation on synthetic, redistributable project images.
 * NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/vision-smoke.ts --confirm-live
 * No YouCam call, private participant image, or measured human benefit is involved.
 */
import nextEnv from "@next/env";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  analyzeCheckpoint,
  analyzeInspiration,
  recognizeTools,
} from "../src/lib/server/vision-assistant";
import { createSession } from "../src/lib/planner";
import { SAMPLE_SETUP } from "../src/lib/catalog";

nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes("--confirm-live")) {
  console.log(
    "Dry run. Use --confirm-live to evaluate synthetic project images with Gemini/OpenAI. No YouCam units are used.",
  );
  process.exit(0);
}
const original = await readFile("public/images/studio-portrait.jpg");
const berry = await readFile("public/images/inspiration-berry.jpg");
const warm = await readFile("public/images/inspiration-terracotta.jpg");
const workbench = await readFile("public/images/workbench-sample.jpg");
const dark = await sharp(original).linear(0.035, 0).jpeg().toBuffer();
const changedLight = await sharp(original)
  .modulate({ brightness: 1.4, saturation: 0.6 })
  .jpeg()
  .toBuffer();
const action = createSession(
  { ...SAMPLE_SETUP, consent: true },
  "00000000-0000-4000-8000-000000000001",
).candidates[0].actions[0];
const jpeg = (bytes: Buffer) => ({ bytes, contentType: "image/jpeg" });
const records: {
  name: string;
  status: string;
  durationMs: number;
  result: unknown;
  expected: string;
}[] = [];
const caseIndex = process.argv.indexOf("--case");
const selectedCase = caseIndex >= 0 ? process.argv[caseIndex + 1] : undefined;
if (
  caseIndex >= 0 &&
  ![
    "berry-inspiration",
    "terracotta-inspiration",
    "workbench-recognition",
    "identical-checkpoint",
    "portrait-is-not-workbench",
    "dark-checkpoint",
    "lighting-only-change",
  ].includes(selectedCase ?? "")
)
  throw new Error("Unknown evaluation case.");
async function run(
  name: string,
  expected: string,
  operation: () => Promise<unknown>,
) {
  if (selectedCase && name !== selectedCase) return;
  const start = Date.now();
  try {
    const result = await operation();
    records.push({
      name,
      expected,
      status: "completed",
      durationMs: Date.now() - start,
      result,
    });
    console.log(
      JSON.stringify({
        name,
        status: "completed",
        durationMs: Date.now() - start,
        result,
      }),
    );
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "unknown_error";
    records.push({
      name,
      expected,
      status: "unavailable",
      durationMs: Date.now() - start,
      result: { code },
    });
    console.log(
      JSON.stringify({
        name,
        status: "unavailable",
        code,
        durationMs: Date.now() - start,
      }),
    );
  }
}
await run(
  "berry-inspiration",
  "Map visible berry palette with uncertainty; do not claim identity or product shade.",
  () => analyzeInspiration(jpeg(berry)),
);
await run(
  "terracotta-inspiration",
  "Map warm terracotta palette with uncertainty.",
  () => analyzeInspiration(jpeg(warm)),
);
await run(
  "portrait-is-not-workbench",
  "No tools/products invented from a face portrait.",
  () => recognizeTools(jpeg(original)),
);
await run(
  "workbench-recognition",
  "Recognize visible sponge, broad brush and labeled cream blush as suggestions requiring confirmation.",
  () => recognizeTools(jpeg(workbench)),
);
await run(
  "identical-checkpoint",
  "Deterministic insufficient evidence without provider inference.",
  () =>
    analyzeCheckpoint({
      baseline: jpeg(original),
      checkpoint: jpeg(original),
      action,
      availableActions: [],
    }),
);
await run(
  "dark-checkpoint",
  "Abstain when a deliberately darkened synthetic photo is not comparable.",
  () =>
    analyzeCheckpoint({
      baseline: jpeg(original),
      checkpoint: jpeg(dark),
      action,
      availableActions: [],
    }),
);
await run(
  "lighting-only-change",
  "Do not classify a lighting/color-processing change as physical makeup progress.",
  () =>
    analyzeCheckpoint({
      baseline: jpeg(original),
      checkpoint: jpeg(changedLight),
      action,
      availableActions: [],
    }),
);
await mkdir("artifacts/private/vision", { recursive: true });
const artifact = {
  observedAt: new Date().toISOString(),
  evidenceClass: "synthetic_model_evaluation",
  physicalOutcomeAssessed: false,
  sourceSha256: createHash("sha256").update(original).digest("hex"),
  note: "Engineering probes using synthetic samples and deterministic edits. No independent human labels, participant validation, representative accuracy estimate, or real physical outcome.",
  records,
};
const path = `artifacts/private/vision/smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
await writeFile(path, JSON.stringify(artifact, null, 2), { mode: 0o600 });
console.log(
  JSON.stringify({
    evidenceFile: path,
    cases: records.length,
    unavailable: records.filter((r) => r.status !== "completed").length,
  }),
);
