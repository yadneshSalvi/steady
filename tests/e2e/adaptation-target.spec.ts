import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { EYE_SAMPLE_SETUP, SAMPLE_SETUP } from "../../src/lib/catalog";
import type {
  CandidatePlan,
  PreviewLevel,
  PreviewStatus,
  SessionCommand,
  StudioAsset,
  StudioSession,
} from "../../src/lib/contracts";
import {
  applicationPreviewTarget,
  applyCommand,
  createSession,
  currentAction,
} from "../../src/lib/planner";
import {
  EffectsSchema,
  selectPreviewLevel,
  validateEffects,
} from "../../src/lib/youcam/recipes";

const recordingShape = z.object({
  recipe: EffectsSchema,
  generatedAt: z.string(),
  output: z.object({ url: z.string(), width: z.number(), height: z.number() }),
});

function recordedAppearance(recipe: CandidatePlan["recipe"]) {
  const expected = JSON.stringify(validateEffects(recipe));
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = join(dir, entry.name);
      return entry.isDirectory()
        ? files(file)
        : entry.name.startsWith("recorded") && entry.name.endsWith(".json")
          ? [file]
          : [];
    });
  for (const file of files("public/examples")) {
    const manifest = JSON.parse(readFileSync(file, "utf8")) as {
      records?: unknown[];
    };
    for (const value of manifest.records ?? []) {
      const record = recordingShape.safeParse(value);
      if (record.success && JSON.stringify(record.data.recipe) === expected)
        return record.data;
    }
  }
  throw new Error("No public recorded fixture matches the selected recipe.");
}

function physicalHistory(session: StudioSession) {
  return JSON.stringify({
    actions: session.activePlan!.actions.filter((action) =>
      session.completedActionIds.includes(action.id),
    ),
    completedActionIds: session.completedActionIds,
    observations: session.observations,
  });
}

/** Real browser/reducer flow with mocked session and provider endpoints. The
 * separate local-Postgres suite exercises durable jobs, quotas and projection. */
async function installAdaptationFixture(page: Page, eyes: boolean) {
  let session = createSession(
    {
      ...structuredClone(eyes ? EYE_SAMPLE_SETUP : SAMPLE_SETUP),
      mode: "personal",
      consent: true,
    },
    randomUUID(),
  );
  session.sourceAssetId = "sample-portrait-v1";
  session.assets = [
    {
      id: session.sourceAssetId,
      url: "/images/studio-portrait.jpg",
      provenance: "synthetic_inspiration",
      purpose: "baseline",
      width: 1024,
      height: 1280,
      createdAt: session.createdAt,
    },
  ];
  const first = session.candidates[0];
  for (const variant of first.previewVariants!) {
    const record = recordedAppearance(variant.recipe);
    const asset: StudioAsset = {
      id: `fixture-initial-${first.routeId}-${variant.id}`,
      url: record.output.url,
      provenance: "virtual_preview",
      purpose: "preview",
      width: record.output.width,
      height: record.output.height,
      createdAt: record.generatedAt,
    };
    variant.previewStatus = "ready";
    variant.previewAsset = asset;
    session.assets.push(asset);
  }
  selectPreviewLevel(first, eyes ? "full" : "build");
  session = applyCommand(session, {
    type: "approve_candidate",
    candidateId: first.id,
  });
  if (!eyes) {
    session = applyCommand(session, { type: "start" });
    const actionId = currentAction(session)!.id;
    session = applyCommand(session, { type: "checkpoint", actionId });
    session = applyCommand(session, { type: "complete_action", actionId });
    // A saved explicit powder proposal exercises the accepted-plan path;
    // generic tool repair deliberately ranks the same cream product first.
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "movement",
      routeId: "sweep",
    });
  }
  const commands: SessionCommand[] = [];
  const forbidden: string[] = [];
  const requests: { candidateId: string; variantId: PreviewLevel }[] = [];
  let pending = false;
  let polls = 0;
  let completion: "hold" | "ready" | "failed" = "hold";
  let output: StudioAsset | undefined;
  let pendingTarget:
    { candidateId: string; variantId: PreviewLevel } | undefined;
  const targetPlan = () => session.adaptation?.candidate ?? session.activePlan!;
  const transition = (status: PreviewStatus) => {
    if (!pendingTarget) return;
    const level = pendingTarget.variantId;
    const copies = [
      ...session.candidates,
      session.activePlan,
      session.adaptation?.candidate,
    ];
    for (const copy of copies) {
      if (!copy || copy.id !== pendingTarget.candidateId) continue;
      const variant = copy.previewVariants!.find(
        (entry) => entry.id === level,
      )!;
      variant.previewStatus = status;
      variant.previewJobId = `mock-provider-attempt-${requests.length}`;
      variant.previewAsset = status === "ready" ? output : undefined;
      variant.previewError =
        status === "failed"
          ? "The target stopped before submission. Your choices are saved."
          : undefined;
      variant.previewRetryable = status === "failed" ? true : undefined;
      selectPreviewLevel(copy, level);
    }
    if (
      status === "ready" &&
      output &&
      !session.assets.some((asset) => asset.id === output!.id)
    )
      session.assets.push(output);
    session.revision++;
    session.updatedAt = new Date().toISOString();
  };
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException(
          "Fixture has no physical camera",
          "NotAllowedError",
        );
      },
    }),
  );
  await page.route("**/api/**", async (route) => {
    forbidden.push(
      `${route.request().method()} ${new URL(route.request().url()).pathname}`,
    );
    await route.fulfill({
      status: 503,
      json: {
        error: {
          code: "FIXTURE_PROCESSING_DISABLED",
          message: "Unmocked processing is disabled in this browser fixture.",
        },
      },
    });
  });
  await page.route(/\/api\/auth\/get-session(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        session: {
          id: "fixture-auth",
          userId: "fixture-owner",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        user: {
          id: "fixture-owner",
          name: "Fictional browser fixture",
          email: "fixture@example.test",
          emailVerified: false,
        },
      },
    }),
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        persistence: "cloud",
        livePreviews: true,
        maxUploadBytes: 8_000_000,
        sampleAvailable: true,
      },
    }),
  );
  await page.route(`**/api/sessions/${session.id}`, async (route) => {
    expect(route.request().method()).toBe("GET");
    if (pending) {
      polls++;
      if (completion === "hold") transition("processing");
      else {
        transition(completion);
        pending = false;
      }
    }
    await route.fulfill({ json: session });
  });
  await page.route(`**/api/sessions/${session.id}/events`, async (route) => {
    const input = route.request().postDataJSON() as {
      expectedRevision: number;
      command: SessionCommand;
    };
    expect(input.expectedRevision).toBe(session.revision);
    commands.push(input.command);
    session = applyCommand(session, input.command);
    await route.fulfill({ json: session });
  });
  await page.route(`**/api/sessions/${session.id}/previews`, async (route) => {
    expect(route.request().method()).toBe("POST");
    const input = route.request().postDataJSON() as {
      expectedRevision: number;
      candidateId: string;
      variantId: PreviewLevel;
    };
    expect(input.expectedRevision).toBe(session.revision);
    const target = applicationPreviewTarget(session)!;
    expect({
      candidateId: input.candidateId,
      variantId: input.variantId,
    }).toEqual(target);
    requests.push(target);
    pendingTarget = target;
    const record = recordedAppearance(targetPlan().recipe);
    output = {
      id: `mock-provider-output-${requests.length}`,
      url: record.output.url,
      provenance: "virtual_preview",
      purpose: "preview",
      width: record.output.width,
      height: record.output.height,
      createdAt: new Date().toISOString(),
    };
    completion = "hold";
    pending = true;
    transition("queued");
    await route.fulfill({ status: 202, json: session });
  });
  return {
    id: session.id,
    snapshot: () => structuredClone(session),
    requests,
    commands,
    forbidden,
    polling: () => polls,
    finish: (value: "ready" | "failed") => {
      completion = value;
    },
    output: () => output!,
  };
}

async function confirmCurrentStep(page: Page) {
  await page
    .getByRole("button", { name: "Done with this step", exact: true })
    .click();
}

async function resume(page: Page) {
  await page
    .getByRole("checkbox", { name: /The confirmed steps still match/ })
    .check();
  await page
    .getByRole("button", { name: "Continue at my pace", exact: true })
    .click();
}

async function assertPending(page: Page) {
  await expect(
    page.getByRole("button", {
      name: "Preparing target…",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator(".method-target-request")).toHaveCount(1);
}

test("personal eye repair generates the proposed selected target and keeps it ready through acceptance and reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const fixture = await installAdaptationFixture(page, true);
  await page.goto(`/studio/${fixture.id}/mirror`);
  await page
    .getByRole("button", { name: "Begin my method", exact: true })
    .click();
  await confirmCurrentStep(page);
  await expect(page.locator(".step-label")).toHaveText("Step 02 of 02");
  const before = fixture.snapshot();
  const history = physicalHistory(before);
  await page
    .getByRole("button", { name: "Make this easier", exact: true })
    .click();
  await page
    .getByRole("button", { name: "A different movement", exact: true })
    .click();
  await expect
    .poll(() => fixture.snapshot().adaptation?.candidate.routeId)
    .toBe("shadow");
  const proposal = fixture.snapshot().adaptation!;
  expect(proposal.candidate.routeId).toBe("shadow");
  expect(proposal.candidate.previewAsset).toBeUndefined();
  await page
    .getByRole("button", {
      name: "Generate target",
      exact: true,
    })
    .click();
  await assertPending(page);
  await expect.poll(fixture.polling).toBeGreaterThan(0);
  expect(fixture.requests).toEqual([
    { candidateId: proposal.candidate.id, variantId: "full" },
  ]);
  fixture.finish("ready");
  await expect
    .poll(() => fixture.snapshot().adaptation?.candidate.previewStatus)
    .toBe("ready");
  const target = page.getByRole("img", {
    name: "full YouCam target for right eye",
    exact: true,
  });
  await expect(target).toBeVisible();
  await expect(target.locator("image")).toHaveAttribute(
    "href",
    fixture.output().url,
  );
  await expect(
    page.getByRole("button", {
      name: "Generate target",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Use this change", exact: true })
    .click();
  expect(fixture.snapshot().activePlan).toMatchObject({
    selectedPreviewVariantId: "full",
    previewStatus: "ready",
    previewAsset: { id: fixture.output().id },
  });
  await resume(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Continue at my pace", exact: true }),
  ).toBeVisible();
  await resume(page);
  await expect(target).toBeVisible();
  await expect(target.locator("image")).toHaveAttribute(
    "href",
    fixture.output().url,
  );
  expect(physicalHistory(fixture.snapshot())).toBe(history);
  expect(fixture.requests).toHaveLength(1);
  expect(fixture.forbidden).toEqual([]);
  expect(errors).toEqual([]);
});

test("accepted cream-to-powder repair generates Build and retries only an explicit unsubmitted failure", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const fixture = await installAdaptationFixture(page, false);
  const before = fixture.snapshot();
  const history = physicalHistory(before);
  const proposed = before.adaptation!;
  expect(proposed.changesGoal).toBe(false);
  expect(proposed.candidate.actions[1].product).toBe("powder_blush");
  await page.goto(`/studio/${fixture.id}/mirror`);
  await page
    .getByRole("button", { name: "Use this change", exact: true })
    .click();
  await resume(page);
  expect(fixture.snapshot().goalChanged).toBe(false);
  const generate = page.getByRole("button", {
    name: "Generate target",
    exact: true,
  });
  await generate.click();
  await assertPending(page);
  await expect.poll(fixture.polling).toBeGreaterThan(0);
  fixture.finish("failed");
  await expect(
    page.getByRole("alert").filter({ hasText: "stopped before submission" }),
  ).toBeVisible();
  await expect(generate).toBeEnabled();
  expect(fixture.requests).toHaveLength(1);
  expect(physicalHistory(fixture.snapshot())).toBe(history);
  await generate.click();
  await assertPending(page);
  fixture.finish("ready");
  await expect
    .poll(() => fixture.snapshot().activePlan?.previewStatus)
    .toBe("ready");
  const target = page.getByRole("img", {
    name: "build YouCam target for right cheek",
    exact: true,
  });
  await expect(target).toBeVisible();
  await expect(target.locator("image")).toHaveAttribute(
    "href",
    fixture.output().url,
  );
  expect(fixture.requests).toEqual([
    { candidateId: proposed.candidate.id, variantId: "build" },
    { candidateId: proposed.candidate.id, variantId: "build" },
  ]);
  expect(fixture.snapshot().activePlan).toMatchObject({
    previewStatus: "ready",
    selectedPreviewVariantId: "build",
    recipe: proposed.candidate.recipe,
  });
  expect(physicalHistory(fixture.snapshot())).toBe(history);
  expect(fixture.snapshot().activePlan!.actions[0].product).toBe("cream_blush");
  expect(fixture.forbidden).toEqual([]);
  expect(errors).toEqual([]);
});

for (const staleResult of ["old proposal", "late error"] as const) {
  test(`accepting an adapted target ignores an in-flight GET's ${staleResult}`, async ({
    page,
  }) => {
    const fixture = await installAdaptationFixture(page, false);
    const history = physicalHistory(fixture.snapshot());
    let holdNext = false;
    let signalHeld!: () => void;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      signalHeld = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/sessions/${fixture.id}`, async (route) => {
      if (!holdNext) return route.fallback();
      holdNext = false;
      const oldProposal = fixture.snapshot();
      signalHeld();
      await gate;
      await route.fulfill({
        status: staleResult === "late error" ? 503 : 200,
        headers: { "x-fixture-stale": "1" },
        json:
          staleResult === "late error"
            ? {
                error: {
                  code: "STALE_POLL",
                  message: "A superseded poll failed.",
                },
              }
            : oldProposal,
      });
    });
    try {
      await page.goto(`/studio/${fixture.id}/mirror`);
      await page
        .getByRole("button", { name: "Generate target", exact: true })
        .click();
      await assertPending(page);
      holdNext = true;
      await held;
      await page
        .getByRole("button", { name: "Use this change", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Continue at my pace", exact: true }),
      ).toBeVisible();
      const accepted = fixture.snapshot();
      expect(accepted.adaptation).toBeUndefined();
      expect(accepted.activePlan!.previewStatus).toBe("queued");
      const staleResponse = page.waitForResponse(
        (response) => response.headers()["x-fixture-stale"] === "1",
      );
      release();
      await (await staleResponse).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      // Immediate checks: a newer polling cycle must not get a chance to hide
      // an old proposal or error that was incorrectly published first.
      expect(
        await page
          .getByRole("button", { name: "Use this change", exact: true })
          .count(),
      ).toBe(0);
      expect(
        await page
          .getByText("A superseded poll failed.", { exact: true })
          .count(),
      ).toBe(0);
      expect(
        await page
          .getByRole("button", { name: "Continue at my pace", exact: true })
          .count(),
      ).toBe(1);
      fixture.finish("ready");
      await resume(page);
      await expect(
        page.getByRole("img", {
          name: "build YouCam target for right cheek",
          exact: true,
        }),
      ).toBeVisible();
      expect(physicalHistory(fixture.snapshot())).toBe(history);
      expect(fixture.requests).toHaveLength(1);
      expect(fixture.forbidden).toEqual([]);
    } finally {
      release();
    }
  });
}
