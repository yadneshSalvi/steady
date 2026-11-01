import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { StudioSession } from "../../src/lib/contracts";
import {
  auditRenderedCopy,
  COPY_TARGETS,
  type CopyScreen,
} from "../../scripts/rendered-copy-audit";
import { signInAnonymous } from "./support/auth";

const viewports = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
];
const paidOperations =
  /\/api\/(?:assets\/|inspiration|tool-suggestions|voice\/transcribe|sessions\/[^/]+\/(?:previews|checkpoint-analysis))/;
type Audit = Awaited<ReturnType<typeof auditRenderedCopy>> & {
  profile?: string;
};

async function aboveFold(page: Page, element: Locator) {
  await expect(element).toBeVisible();
  const bounds = await element.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function mergeJson(path: string, key: string, entry: unknown) {
  const previous = await readFile(path, "utf8")
    .then((raw) => JSON.parse(raw) as Record<string, unknown>)
    .catch(() => ({}));
  await writeFile(
    path,
    `${JSON.stringify({ ...previous, [key]: entry }, null, 2)}\n`,
  );
}

async function capture(
  page: Page,
  info: TestInfo,
  screen: string,
  audits: Audit[],
) {
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("main").evaluate(async (main) => {
    const finite = main
      .getAnimations({ subtree: true })
      .filter((animation) =>
        Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
      );
    await Promise.all(
      finite.map((animation) => animation.finished.catch(() => undefined)),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect
    .poll(() =>
      page.getByRole("heading", { level: 1 }).evaluate((heading) => {
        for (
          let node: Element | null = heading;
          node;
          node = node.parentElement
        ) {
          if (Number(getComputedStyle(node).opacity) !== 1) return false;
        }
        return true;
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.locator("main img").evaluateAll((images) =>
        images.every((element) => {
          const image = element as HTMLImageElement;
          const box = image.getBoundingClientRect();
          if (
            !box.width ||
            !box.height ||
            box.bottom < 0 ||
            box.top > innerHeight
          )
            return true;
          return image.complete && image.naturalWidth > 0;
        }),
      ),
    )
    .toBe(true);
  const viewport = page.viewportSize()!;
  const profile =
    screen === "setup-photo"
      ? "personal-empty-upload"
      : screen.startsWith("setup-")
        ? "sample-setup"
        : screen === "settings"
          ? "two-sample-studios"
          : screen === "saved-methods"
            ? "one-saved-sample"
            : ["landing", "evidence"].includes(screen)
              ? "public"
              : "sample";
  const name = `${screen}-${viewport.width}x${viewport.height}`;
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await info.attach(name, { path, contentType: "image/png" });
  if (screen in COPY_TARGETS)
    audits.push({
      ...(await auditRenderedCopy(page, screen as CopyScreen)),
      profile,
    });
  if (process.env.STEADY_CAPTURE_ROUND3_EVIDENCE !== "1") return;
  const origin = new URL(page.url()).origin;
  const environment =
    origin === "http://localhost:3000"
      ? "local"
      : origin === "https://steady-taupe-pi.vercel.app"
        ? "canonical"
        : null;
  if (!environment)
    throw new Error(
      "Public after exports require the coordinated local server or exact canonical origin.",
    );
  const directory = resolve("docs/evidence/round3");
  await mkdir(resolve(directory, "after"), { recursive: true });
  await copyFile(path, resolve(directory, "after", `${name}.png`));
  await mergeJson(resolve(directory, "after-captures.json"), name, {
    screen,
    profile,
    viewport,
    origin,
    environment,
    path: `after/${name}.png`,
    capturedAt: new Date().toISOString(),
    capture:
      "Fresh isolated Chromium context at native viewport; expected heading, finished finite animations, heading-ancestor opacity1 and loaded visible images; actual rendered UI, no composites.",
  });
  await mergeJson(
    resolve(directory, "rendered-copy-audit.json"),
    `${viewport.width}x${viewport.height}`,
    {
      origin,
      environment,
      audits,
    },
  );
  if (viewport.width === 1440 && environment === "local") {
    const crop =
      screen === "methods"
        ? [".method-target-stage .preview-ladder", "ladder"]
        : screen === "mirror-step"
          ? [".mirror-layout", "mirror"]
          : screen === "checkpoint"
            ? [".mirror-layout", "checkpoint"]
            : null;
    if (crop) {
      await page
        .locator(crop[0])
        .screenshot({ path: resolve(directory, `product-${crop[1]}.png`) });
      if (screen === "methods") {
        await page
          .locator(".method-target-stage")
          .screenshot({ path: resolve(directory, "product-ladder-stage.png") });
        await page
          .locator(".candidate-visual")
          .screenshot({ path: resolve(directory, "product-ladder-image.png") });
      }
    }
  }
}

for (const viewport of viewports) {
  test.describe(`R3 native ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("measured and unmeasured confirmations preserve the saved method and fit the judge path", async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      const ids: string[] = [];
      const audits: Audit[] = [];
      const paid: string[] = [];
      const errors: string[] = [];
      const generationButtons: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(paidOperations, (route) => {
        paid.push(new URL(route.request().url()).pathname);
        return route.fulfill({
          status: 503,
          json: {
            error: {
              message: "Paid processing is blocked by this sample regression.",
            },
          },
        });
      });
      await page.exposeFunction(
        "__steadyReportGenerationButton",
        (text: string) => generationButtons.push(text),
      );
      await page.addInitScript(() => {
        const found = new Set<string>();
        const scan = () => {
          for (const button of document.querySelectorAll("button")) {
            const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
            if (
              /^(Generate target|Generate previews|Retry previews)/.test(
                text,
              ) &&
              !found.has(text)
            ) {
              found.add(text);
              void (
                window as Window & {
                  __steadyReportGenerationButton?: (
                    label: string,
                  ) => Promise<void>;
                }
              ).__steadyReportGenerationButton?.(text);
            }
          }
        };
        new MutationObserver(scan).observe(document, {
          childList: true,
          subtree: true,
        });
      });
      const saved = async (id: string): Promise<StudioSession> => {
        const response = await page.request.get(`/api/sessions/${id}`);
        expect(response.ok()).toBe(true);
        return response.json();
      };
      try {
        await signInAnonymous(page.request);
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Beauty, at your own pace.",
        );
        await expect(page.locator(".provenance")).toHaveCount(0);
        await capture(page, info, "landing", audits);
        await page
          .getByRole("button", { name: "Quick sample", exact: true })
          .click();
        await page.waitForURL(/\/studio\/[^/]+\/looks$/);
        const id = new URL(page.url()).pathname.split("/")[2];
        ids.push(id);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Methods",
        );
        await expect(
          page.locator(".method-target-stage .candidate-visual img"),
        ).toHaveCount(1);
        await expect(
          page.locator(".method-target-stage .preview-ladder img"),
        ).toHaveCount(3);
        await expect(page.locator("article.method-option img")).toHaveCount(0);
        const tap = page.locator("article.method-option").filter({
          has: page.getByRole("heading", {
            name: "Fingertip tapping",
            exact: true,
          }),
        });
        await aboveFold(page, page.locator(".method-target-stage"));
        await aboveFold(
          page,
          tap.getByRole("button", { name: "Choose", exact: true }),
        );
        await capture(page, info, "methods", audits);
        await tap.getByRole("button", { name: "Choose", exact: true }).click();
        await page.waitForURL(/\/mirror$/);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Mirror",
        );
        await capture(page, info, "mirror-ready", audits);
        await page
          .getByRole("button", { name: "Begin the walkthrough", exact: true })
          .click();
        const done = page.getByRole("button", {
          name: "Done with this step",
          exact: true,
        });
        const measure = page.getByRole("button", {
          name: "Measure the sample",
          exact: true,
        });
        await aboveFold(page, done);
        await aboveFold(page, measure);
        await expect(measure).toBeEnabled();
        await expect(page.locator(".static-face-guide polygon")).toBeVisible();
        const original = await saved(id);
        expect(original.completedActionIds).toEqual([]);
        expect(original.observations).toEqual([]);
        const firstAction = structuredClone(original.activePlan!.actions[0]);
        await capture(page, info, "mirror-step", audits);
        await measure.click();
        await expect
          .poll(async () => (await saved(id)).observations.length)
          .toBe(1);
        const measured = await saved(id);
        const observation = structuredClone(measured.observations[0]);
        expect(measured.completedActionIds).toEqual([]);
        expect(observation.measurement).toMatchObject({
          provenance: "simulated",
          geometryVersion: "blush-centroid-oval-v3",
          targetLevel: "full",
        });
        expect(observation.measurement!.progress).toBeGreaterThan(0.2);
        expect(observation.measurement!.progress).toBeLessThan(0.7);
        expect(observation.measurement!.lagging).toBeTruthy();
        const progress = page.getByRole("progressbar", {
          name: "Color change toward your chosen target",
        });
        await expect(progress).toHaveAttribute(
          "aria-valuenow",
          String(Math.round(observation.measurement!.progress! * 100)),
        );
        await aboveFold(page, done);
        await aboveFold(
          page,
          page.getByRole("region", { name: "Your checkpoint", exact: true }),
        );
        await expect(page.locator(".mirror-checkpoint-image")).toBeVisible();
        await expect(
          page.getByRole("img", {
            name: "Measured color change heatmap",
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.locator(".measurement-areas")).toHaveText(
          /^(Upper|Outer) \d+% · (lower|inner) \d+%$/,
        );
        const marker = page.locator(".heatmap-target-marker");
        await expect(marker).toHaveText("100% target");
        expect(
          await marker.evaluate((element) =>
            Number.parseFloat((element as HTMLElement).style.left),
          ),
        ).toBeCloseTo(100 / 1.5);
        await capture(page, info, "checkpoint", audits);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await done.click();
        await expect(page.locator(".step-label")).toHaveText("Step 02 of 02");
        const confirmed = await saved(id);
        expect(confirmed.completedActionIds).toEqual([firstAction.id]);
        expect(confirmed.activePlan!.actions[0]).toEqual(firstAction);
        await page
          .getByRole("button", { name: "Make this easier", exact: true })
          .click();
        await page
          .getByRole("button", { name: "A different movement", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Use this change", exact: true }),
        ).toBeVisible();
        expect((await saved(id)).adaptation!.candidate.actions[0]).toEqual(
          firstAction,
        );
        await capture(page, info, "adaptation", audits);
        await page
          .getByRole("button", { name: "Use this change", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Continue sample", exact: true })
          .click();
        await aboveFold(page, done);
        await measure.click();
        await expect
          .poll(async () => (await saved(id)).observations.length)
          .toBe(2);
        const bothMeasured = await saved(id);
        expect(bothMeasured.observations[0]).toEqual(observation);
        expect(bothMeasured.observations[1].measurement?.region).toBe(
          "right_cheek",
        );
        expect(bothMeasured.completedActionIds).toEqual([firstAction.id]);
        // Broad blending after the adaptation gets the broad-pass sentence.
        const details = page.getByText("Measurement details", { exact: true });
        await details.click();
        await expect(page.locator(".measurement-spatial-guidance")).toHaveText(
          "One more broad pass toward your ear.",
        );
        await details.click();
        await done.click();
        await page.waitForURL(/\/review$/);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Review",
        );
        const reviewed = await saved(id);
        expect(reviewed.completedActionIds).toHaveLength(2);
        expect(reviewed.activePlan!.actions[0]).toEqual(firstAction);
        expect(reviewed.observations).toEqual(bothMeasured.observations);
        expect(
          reviewed.assets.filter((asset) => asset.purpose === "checkpoint"),
        ).toEqual([]);
        await expect(page.locator(".review-method-diff")).toHaveText(
          `Right cheek: Fingertips → ${reviewed.activePlan!.name}`,
        );
        await expect(
          page.locator(".review-checkpoints .measurement-legend"),
        ).toHaveCount(1);
        await capture(page, info, "review", audits);
        await page
          .getByRole("button", { name: "Save my method", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Method saved", exact: true }),
        ).toBeDisabled();
        const finished = await saved(id);
        expect(finished.stage).toBe("completed");
        expect(finished.savedMethod).toBe(true);
        expect(finished.outcome).toBeUndefined();
        await page.getByRole("link", { name: "Finish", exact: true }).click();
        await page.waitForURL(/\/methods$/);
        await expect(page.locator(".method-card")).toHaveCount(1);
        await expect(page.locator(".recent-sessions")).toHaveCount(0);
        await capture(page, info, "saved-methods", audits);

        await page.goto("/studio/new?mode=sample");
        for (const [screen, heading] of [
          ["setup-color", "Choose a color"],
          ["setup-movements", "How do you like to move?"],
          ["setup-tools", "Your tools"],
          ["setup-photo", "Your photo"],
        ]) {
          if (screen === "setup-photo") {
            await page
              .getByRole("button", { name: "Use my photo", exact: true })
              .click();
            await expect(page.getByRole("heading", { level: 1 })).toHaveText(
              "How do you like to move?",
            );
            await page
              .getByRole("group", { name: "Tapping comfort", exact: true })
              .getByRole("radio", { name: "Feels good", exact: true })
              .check();
            await page
              .getByRole("button", { name: "Continue", exact: true })
              .click();
            await page
              .getByRole("checkbox", { name: "Fingertips", exact: true })
              .check();
            await page
              .getByRole("checkbox", { name: "Cream blush", exact: true })
              .check();
            await page
              .getByRole("button", { name: "Continue", exact: true })
              .click();
            await expect(
              page.getByRole("checkbox", {
                name: /I’m 18\+, have photo permission/,
              }),
            ).not.toBeChecked();
          }
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            heading,
          );
          await capture(page, info, screen, audits);
          if (screen !== "setup-photo")
            await page
              .getByRole("button", { name: "Continue", exact: true })
              .click();
        }
        await page.goto("/");
        await page
          .getByRole("button", { name: "Explore the eye sample", exact: true })
          .click();
        await page.waitForURL(/\/studio\/[^/]+\/looks$/);
        const eyeId = new URL(page.url()).pathname.split("/")[2];
        ids.push(eyeId);
        const shadow = page.locator("article.method-option").filter({
          has: page.getByRole("heading", {
            name: "Soft tapped shadow",
            exact: true,
          }),
        });
        await shadow
          .getByRole("button", { name: "View target", exact: true })
          .click();
        await expect
          .poll(async () =>
            page
              .locator(".method-target-stage .candidate-visual img")
              .evaluate((image) => {
                const url = new URL((image as HTMLImageElement).src);
                return url.searchParams.get("url") ?? url.pathname;
              }),
          )
          .toBe("/examples/round3/shadow-full-warm-v4.png");
        // Different looks: each method shows its own target, side by side.
        await expect(
          page.getByRole("img", { name: "full target for Fine upper liner" }),
        ).toBeVisible();
        await expect(
          page.getByRole("img", {
            name: "full target for Soft tapped shadow",
          }),
        ).toBeVisible();
        await capture(page, info, "eye-methods", audits);
        await shadow
          .getByRole("button", { name: "Choose", exact: true })
          .click();
        await page.waitForURL(/\/mirror$/);
        await page
          .getByRole("button", { name: "Begin the walkthrough", exact: true })
          .click();
        await aboveFold(page, done);
        await expect(measure).toBeEnabled();
        await aboveFold(page, measure);
        const eyeInstruction = (await page
          .locator(".instruction-scroll")
          .boundingBox())!;
        for (const level of ["Light", "Full"]) {
          const button = page.getByRole("button", {
            name: new RegExp(`^Stop at ${level} for`),
          });
          await aboveFold(page, button);
          const box = (await button.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(eyeInstruction.x);
          expect(box.y).toBeGreaterThanOrEqual(eyeInstruction.y);
          expect(box.x + box.width).toBeLessThanOrEqual(
            eyeInstruction.x + eyeInstruction.width + 1,
          );
          expect(box.y + box.height).toBeLessThanOrEqual(
            eyeInstruction.y + eyeInstruction.height + 1,
          );
        }
        await capture(page, info, "eye-mirror", audits);
        await measure.click();
        await expect
          .poll(async () => (await saved(eyeId)).observations.length)
          .toBe(1);
        expect((await saved(eyeId)).observations[0].measurement).toMatchObject({
          region: "left_eye",
          provenance: "simulated",
        });
        await capture(page, info, "eye-checkpoint", audits);
        await page.goto("/settings/access");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Settings",
        );
        await expect(page.locator(".data-row")).toHaveCount(2);
        await capture(page, info, "settings", audits);
        await page.goto("/evidence");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Evidence & limits",
        );
        await capture(page, info, "evidence", audits);

        // A separate actual-backend sample branch checks direct confirmation
        // without opening a checkpoint or inventing either observation.
        await page.goto("/");
        await page
          .getByRole("button", { name: "Quick sample", exact: true })
          .click();
        await page.waitForURL(/\/studio\/[^/]+\/looks$/);
        const unmeasuredId = new URL(page.url()).pathname.split("/")[2];
        ids.push(unmeasuredId);
        await page
          .getByRole("button", { name: "Choose", exact: true })
          .first()
          .click();
        await page.waitForURL(/\/mirror$/);
        await page
          .getByRole("button", { name: "Begin the walkthrough", exact: true })
          .click();
        await aboveFold(page, done);
        await done.click();
        await expect(page.locator(".step-label")).toHaveText("Step 02 of 02");
        expect((await saved(unmeasuredId)).observations).toEqual([]);
        await done.click();
        await page.waitForURL(/\/review$/);
        await expect(page.locator(".review-checkpoints")).toHaveCount(0);
        await expect(page.locator(".review-summary-grid--plain")).toHaveCount(
          1,
        );
        const unmeasured = await saved(unmeasuredId);
        expect(unmeasured.stage).toBe("reviewing");
        expect(unmeasured.completedActionIds).toHaveLength(2);
        expect(unmeasured.observations).toEqual([]);
        expect(unmeasured.outcome).toBeUndefined();
        expect(generationButtons).toEqual([]);
        expect(
          audits.map((audit) => ({
            screen: audit.screen,
            count: audit.authoredCount,
            limit: audit.limit,
            withinLimit: audit.withinLimit,
          })),
        ).toEqual(
          expect.arrayContaining(
            Object.keys(COPY_TARGETS).map((screen) =>
              expect.objectContaining({ screen, withinLimit: true }),
            ),
          ),
        );
        expect(paid).toEqual([]);
        expect(errors).toEqual([]);
      } finally {
        await info.attach("rendered-copy-audit", {
          body: JSON.stringify(audits, null, 2),
          contentType: "application/json",
        });
        const cleanup = [];
        for (const id of ids) {
          const deleted = await page.request.delete(`/api/sessions/${id}`, {
            headers: { Origin: new URL(page.url()).origin },
            timeout: 10_000,
          });
          const lookup = await page.request.get(`/api/sessions/${id}`);
          cleanup.push({
            deleteStatus: deleted.status(),
            lookupStatus: lookup.status(),
          });
        }
        await info.attach("fixture-cleanup", {
          body: JSON.stringify(cleanup, null, 2),
          contentType: "application/json",
        });
        expect(cleanup).toEqual(
          ids.map(() => ({ deleteStatus: 200, lookupStatus: 404 })),
        );
      }
    });
  });
}
