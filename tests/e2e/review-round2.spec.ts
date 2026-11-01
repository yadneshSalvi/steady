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

test("hero provenance remains compact, readable and clear of the movement card at all review sizes", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const chip = page.locator(".portrait-provenance .provenance");
    await expect(chip).toBeVisible();
    const bounds = await chip.boundingBox();
    const card = await page.locator(".method-note").boundingBox();
    expect(bounds).not.toBeNull();
    expect(card).not.toBeNull();
    expect(bounds!.width).toBeLessThan(220);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    const overlaps =
      bounds!.x < card!.x + card!.width &&
      bounds!.x + bounds!.width > card!.x &&
      bounds!.y < card!.y + card!.height &&
      bounds!.y + bounds!.height > card!.y;
    expect(overlaps).toBe(false);
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
    await tap
      .getByRole("button", { name: "Choose this method", exact: true })
      .click();
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
    await expect(checkpoint.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "38",
    );
    await expect(checkpoint.locator(".measurement-guidance")).toContainText(
      "upper part is lighter",
    );
    await expect(
      checkpoint.locator(".measurement-spatial-guidance"),
    ).toContainText("outer part is also lighter");
    await expect(
      checkpoint.locator(".measurement-spatial-guidance"),
    ).toContainText("23%");
    await expect(
      checkpoint.locator(".measurement-spatial-guidance"),
    ).toContainText("53%");
    await expect(checkpoint.getByLabel("Heatmap color scale")).toContainText(
      "full target",
    );
    const firstPass = round2.records.find(
      (record) => record.id === "blush-rose-satin",
    )!;
    await expect(
      checkpoint.locator(".measurement-still image"),
    ).toHaveAttribute("href", firstPass.output.url);
    const measured = (await saved()).observations.at(-1)!.measurement!;
    expect(measured.geometryVersion).toBe("cheekbone-oval-v2");
    expect(measured.sampleCheckpointId).toBe(firstPass.output.sha256);
    expect(measured.lagging).toBe("upper");
    expect(measured.progress).toBeGreaterThan(0.36);
    expect(measured.progress).toBeLessThan(0.4);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const visual = checkpoint.locator(".measurement-still > svg");
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
      await checkpoint
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
    const stalled = page
      .locator(".notice")
      .filter({ hasText: "A broader tool may help" });
    await expect(stalled).toBeVisible();
    await stalled
      .getByRole("button", { name: "Make this easier", exact: true })
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
