import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator } from "@playwright/test";
import type { StudioSession } from "../../src/lib/contracts";
import { signInAnonymous } from "./support/auth";

const paidOperations =
  /\/api\/(?:assets\/|inspiration|tool-suggestions|voice\/transcribe|sessions\/[^/]+\/(?:previews|checkpoint-analysis))/;

test.use({ viewport: { width: 1440, height: 900 } });

test("warm look-derived heatmaps survive both cheek Review cards and the eye sample", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const paid: string[] = [];
  const errors: string[] = [];
  const ids: string[] = [];
  const evidence: Record<string, unknown> = {};
  const capture = process.env.STEADY_CAPTURE_HEATMAP_EVIDENCE === "1";
  const origin = new URL(process.env.TEST_BASE_URL || "http://localhost:3000")
    .origin;
  const environment =
    origin === "https://steady-taupe-pi.vercel.app" ? "production" : "local";
  const directory = resolve("docs/evidence/warm-heatmap", environment);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(paidOperations, (route) => {
    paid.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: 503,
      json: {
        error: { message: "Paid processing blocked by heatmap regression." },
      },
    });
  });
  async function saved(id: string): Promise<StudioSession> {
    const response = await page.request.get(`/api/sessions/${id}`);
    expect(response.ok()).toBe(true);
    return response.json();
  }
  async function settle() {
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("main").evaluate(async (main) => {
      await Promise.all(
        main
          .getAnimations({ subtree: true })
          .filter((animation) =>
            Number.isFinite(
              Number(animation.effect?.getComputedTiming().endTime),
            ),
          )
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    await page.mouse.move(1438, 898);
  }
  async function screenshot(name: string) {
    await settle();
    const path = info.outputPath(`${name}-1440x900.png`);
    await page.screenshot({ path, fullPage: false });
    await info.attach(name, { path, contentType: "image/png" });
    if (capture) {
      await mkdir(directory, { recursive: true });
      await copyFile(path, resolve(directory, `${name}-1440x900.png`));
    }
  }
  async function assertHeatmap(root: Locator, name: string, eye = false) {
    const cells = root.locator(
      '[aria-label="Measured color change heatmap"] > g > polygon',
    );
    await expect.poll(() => cells.count()).toBeGreaterThan(4);
    const fills = await cells.evaluateAll((polygons) =>
      polygons.map((polygon) => ({
        color: polygon.getAttribute("fill")!,
        alpha: Number(polygon.getAttribute("fill-opacity")),
      })),
    );
    expect(new Set(fills.map((fill) => fill.color)).size).toBeGreaterThan(2);
    expect(new Set(fills.map((fill) => fill.alpha)).size).toBeGreaterThan(2);
    for (const fill of fills) {
      const [red, green, blue] = fill.color.match(/\d+/g)!.map(Number);
      expect(red).toBeGreaterThan(green);
      expect(red).toBeGreaterThan(blue);
      if (eye) expect(green).toBeGreaterThan(blue);
      expect(fill.alpha).toBeGreaterThanOrEqual(0.13);
      expect(fill.alpha).toBeLessThanOrEqual(0.67);
    }
    const legend = page.locator(".heatmap-scale");
    await expect(legend).toHaveCount(1);
    await expect(page.locator(".heatmap-target-marker")).toHaveText(
      "100% target",
    );
    const background = await legend.evaluate(
      (element) => (element as HTMLElement).style.background,
    );
    expect(background).toContain("201, 151, 126");
    expect(background).toContain(eye ? "107, 74, 64" : "190, 102, 128");
    evidence[name] = {
      cells: fills.length,
      colors: new Set(fills.map((fill) => fill.color)).size,
      alphaMin: Math.min(...fills.map((fill) => fill.alpha)),
      alphaMax: Math.max(...fills.map((fill) => fill.alpha)),
      legend: background,
      warmChannels: true,
    };
  }
  async function create(eye = false) {
    await page.goto("/");
    await page
      .getByRole("button", {
        name: eye ? "Explore the eye sample" : "Quick sample",
        exact: true,
      })
      .click();
    await page.waitForURL(/\/studio\/[^/]+\/looks$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    ids.push(id);
    const method = page.locator("article.method-option").filter({
      has: page.getByRole("heading", {
        name: eye ? "Soft tapped shadow" : "Fingertip tapping",
        exact: true,
      }),
    });
    await method.getByRole("button", { name: "Choose", exact: true }).click();
    await page.waitForURL(/\/mirror$/);
    await page
      .getByRole("button", { name: "Begin the walkthrough", exact: true })
      .click();
    return id;
  }
  async function measure(id: string, count: number) {
    await page
      .getByRole("button", { name: "Measure the sample", exact: true })
      .click();
    await expect
      .poll(async () => (await saved(id)).observations.length)
      .toBe(count);
    await expect(page.locator(".mirror-checkpoint-image")).toBeVisible();
  }
  try {
    await signInAnonymous(page.request);
    const id = await create();
    await measure(id, 1);
    await assertHeatmap(
      page.locator(".mirror-checkpoint-image"),
      "mirror-cheek",
    );
    await screenshot("mirror-checkpoint");
    if (capture && environment === "local") {
      const source = resolve(
        "docs/evidence/round3/product-source/product-checkpoint.png",
      );
      await page.locator(".mirror-layout").screenshot({ path: source });
      await copyFile(
        source,
        resolve("docs/evidence/round3/product-checkpoint.png"),
      );
    }
    await page
      .getByRole("button", { name: "Done with this step", exact: true })
      .click();
    await expect(page.locator(".step-label")).toHaveText("Step 02 of 02");
    await measure(id, 2);
    await page
      .getByRole("button", { name: "Done with this step", exact: true })
      .click();
    await page.waitForURL(/\/review$/);
    const cards = page.locator(".review-checkpoint");
    await expect(cards).toHaveCount(2);
    await assertHeatmap(cards.nth(0), "review-left-cheek");
    await assertHeatmap(cards.nth(1), "review-right-cheek");
    await screenshot("review-cheeks");
    const eyeId = await create(true);
    await measure(eyeId, 1);
    await assertHeatmap(
      page.locator(".mirror-checkpoint-image"),
      "mirror-eye",
      true,
    );
    await screenshot("eye-checkpoint");
    expect(paid).toEqual([]);
    expect(errors).toEqual([]);
    if (capture)
      await writeFile(
        resolve(directory, "checks.json"),
        `${JSON.stringify({ origin, viewport: { width: 1440, height: 900 }, recordedSamples: true, paidRequests: paid, browserErrors: errors, evidence }, null, 2)}\n`,
      );
  } finally {
    for (const id of ids)
      await page.request.delete(`/api/sessions/${id}`, {
        headers: { Origin: origin },
      });
  }
});
