import { expect, test } from "@playwright/test";
import type { StudioSession } from "../../src/lib/contracts";
import round2 from "../../public/examples/recorded-round2.json" with { type: "json" };
import { signInAnonymous } from "./support/auth";

const viewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 813 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

test("plain hero keeps its title, portrait and movement card readable at all review sizes", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toHaveText("Beauty, at your own pace.");
    await expect(page.locator(".provenance")).toHaveCount(0);
    const bounds = await page.locator(".hero-visual").boundingBox();
    const card = await page.locator(".method-note").boundingBox();
    expect(bounds).not.toBeNull();
    expect(card).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(viewport.width);
    const titleBounds = (await title.boundingBox())!;
    const overlapsTitle =
      card!.x < titleBounds.x + titleBounds.width &&
      card!.x + card!.width > titleBounds.x &&
      card!.y < titleBounds.y + titleBounds.height &&
      card!.y + card!.height > titleBounds.y;
    expect(overlapsTitle).toBe(false);
    await expect(page.locator(".hero-portrait")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Find your way", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
    await page.screenshot({
      path: testInfo.outputPath(
        `hero-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: false,
    });
  }
});

test("actual partial sample keeps its full translucent cheek heatmap and opens a direct broader-tool repair after two reported passes", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const paidRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(
    /\/api\/(?:inspiration|tool-suggestions|voice\/transcribe|sessions\/[^/]+\/(?:previews|checkpoint-analysis))(?:\?|$)/,
    (route) => {
      paidRequests.push(route.request().url());
      return route.fulfill({
        status: 503,
        json: {
          error: { message: "Paid processing is disabled in this test." },
        },
      });
    },
  );
  await signInAnonymous(page.request);
  let id = "";
  const saved = async (): Promise<StudioSession> => {
    const response = await page.request.get(`/api/sessions/${id}`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  try {
    await page.setViewportSize(viewports[0]);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Quick sample", exact: true })
      .click();
    await page.waitForURL(/\/studio\/[^/]+\/looks$/);
    id = new URL(page.url()).pathname.split("/")[2];
    const tap = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "Fingertip tapping",
        exact: true,
      }),
    });
    await tap.getByRole("button", { name: "Choose", exact: true }).click();
    await page.waitForURL(/\/mirror$/);
    await page
      .getByRole("button", { name: "Begin the walkthrough", exact: true })
      .click();
    const guide = page.locator(".static-face-guide polygon");
    await expect(guide).toBeVisible();
    expect(
      (await guide.getAttribute("points"))!.trim().split(/\s+/),
    ).toHaveLength(48);
    await expect(guide).toHaveAttribute("stroke-linejoin", "round");
    await expect(
      page.locator(".instruction-target .preview-ladder img"),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Measure the sample", exact: true })
      .click();
    const checkpoint = page.getByRole("region", {
      name: "Your checkpoint",
      exact: true,
    });
    await expect.poll(async () => (await saved()).observations.length).toBe(1);
    const measured = (await saved()).observations.at(-1)!.measurement!;
    await expect(checkpoint.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      String(Math.round(measured.progress! * 100)),
    );
    await expect(checkpoint.locator(".measurement-guidance")).toContainText(
      "Work up along the cheekbone.",
    );
    await checkpoint.getByText("Measurement details", { exact: true }).click();
    await expect(
      checkpoint.locator(".measurement-spatial-guidance"),
    ).toContainText("toward your ear.");
    await checkpoint.getByText("Measurement details", { exact: true }).click();
    await expect(page.locator(".heatmap-target-marker")).toHaveText(
      "100% target",
    );
    const firstPass = round2.records.find(
      (record) => record.id === "blush-rose-satin",
    )!;
    await expect(
      page.locator(".mirror-checkpoint-image image"),
    ).toHaveAttribute("href", firstPass.output.url);
    expect(measured.geometryVersion).toBe("blush-centroid-oval-v3");
    expect(measured.sampleCheckpointId).toBe(firstPass.output.sha256);
    expect(measured.lagging).toBe("upper");
    expect(measured.progress).toBeGreaterThan(0.2);
    expect(measured.progress).toBeLessThan(0.65);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const visual = page.locator(".mirror-checkpoint-image");
      const outline = visual.locator(
        '[aria-label="Measured color change heatmap"] > polygon',
      );
      await expect
        .poll(async () => {
          const box = await visual.boundingBox();
          const mask = await outline.boundingBox();
          return (
            !!box &&
            !!mask &&
            mask.x > box.x + 2 &&
            mask.y > box.y + 2 &&
            mask.x + mask.width < box.x + box.width - 2 &&
            mask.y + mask.height < box.y + box.height - 2
          );
        })
        .toBe(true);
      const cells = visual.locator(
        '[aria-label="Measured color change heatmap"] > g > polygon',
      );
      expect(await cells.count()).toBeGreaterThan(4);
      const fills = await cells.evaluateAll((items) =>
        items.map((item) => ({
          opacity: Number(item.getAttribute("fill-opacity")),
          color: item.getAttribute("fill"),
        })),
      );
      expect(
        fills.every((fill) => fill.opacity >= 0.35 && fill.opacity <= 0.5),
      ).toBe(true);
      expect(new Set(fills.map((fill) => fill.color)).size).toBeGreaterThan(2);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(viewport.width);
      await checkpoint.screenshot({
        path: testInfo.outputPath(
          `partial-checkpoint-${viewport.width}x${viewport.height}.png`,
        ),
      });
    }
    for (let pass = 1; pass <= 2; pass++) {
      await page
        .getByRole("button", {
          name: "I made a pass · check again",
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await saved()).observations.length)
        .toBe(pass + 1);
    }
    await checkpoint
      .getByRole("button", { name: "Close checkpoint", exact: true })
      .click();
    const stalled = page.locator(".notice").filter({
      has: page.getByRole("button", {
        name: "Try a broader tool",
        exact: true,
      }),
    });
    await expect(stalled).toBeVisible();
    await stalled
      .getByRole("button", { name: "Try a broader tool", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Use this change", exact: true }),
    ).toBeVisible();
    const proposed = await saved();
    expect(proposed.adaptation?.reason).toBe("tool");
    expect(proposed.adaptation?.candidate.actions[0].product).toBe(
      "cream_blush",
    );
    expect(proposed.adaptation?.candidate.actions[0].tool).not.toBe(
      "fingertips",
    );
    expect(proposed.completedActionIds).toEqual([]);
    await page
      .getByRole("button", { name: "Other changes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "A different movement", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "A softer version", exact: true }),
    ).toBeVisible();
    expect((await saved()).adaptation).toBeUndefined();
    expect(paidRequests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (id) await page.request.delete(`/api/sessions/${id}`).catch(() => {});
  }
});
