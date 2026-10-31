import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SAMPLE_SETUP } from "../../src/lib/catalog";
import type { StudioSession } from "../../src/lib/contracts";
import { signInAnonymous } from "./support/auth";
import { installStudioFixture } from "./support/studio-fixture";

const paidOperations =
  /\/api\/(?:inspiration|tool-suggestions|voice\/transcribe|sessions\/[^/]+\/(?:previews|checkpoint-analysis))(?:\?|$)/;

async function checkAccessibility(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function sessionFrom(page: Page, id: string) {
  const response = await page.request.get(`/api/sessions/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as StudioSession;
}

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 8; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement))
      break;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
  const outline = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: Number.parseFloat(style.outlineWidth),
      style: style.outlineStyle,
    };
  });
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(outline.style).not.toBe("none");
}

test("sample studio completes, adapts, saves, reuses and deletes through the UI", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000); // Includes eight full accessibility scans; no inference.
  const errors: string[] = [];
  const blockedPaidRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(paidOperations, (route) => {
    blockedPaidRequests.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: 503,
      json: {
        error: { message: "Paid processing is disabled in this UI test." },
      },
    });
  });
  await page.setViewportSize({ width: 1265, height: 712 });
  let sessionId = "";
  try {
    await test.step("choose the labeled sample and its methods", async () => {
      await signInAnonymous(page.request);
      await page.goto("/");
      await page
        .getByRole("button", { name: "Quick sample", exact: true })
        .click();
      await page.waitForURL(/\/studio\/[^/]+\/looks$/);
      sessionId = new URL(page.url()).pathname.split("/")[2];
      await expect(
        page.getByRole("button", { name: "Choose this method", exact: true }),
      ).toHaveCount(3);
      await expect(
        page.getByRole("heading", { level: 1 }),
      ).toHaveAccessibleName("Three ways. Entirely yours.");
      const firstMethod = page.getByRole("article").first();
      await firstMethod.getByRole("button", { name: /Stop at Build/ }).click();
      await expect(
        firstMethod.getByRole("button", { name: /Stop at Build/ }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("button", { name: /Generate fresh/ }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Recorded YouCam", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("dialog", { name: "Recorded YouCam" }),
      ).toContainText("real YouCam render");
      await page.keyboard.press("Escape");
      await checkAccessibility(page);
      await page
        .getByRole("button", { name: "Choose this method", exact: true })
        .first()
        .click();
      await page.waitForURL(/\/mirror$/);
      expect(
        (await sessionFrom(page, sessionId)).activePlan
          ?.selectedPreviewVariantId,
      ).toBe("build");
      await page
        .getByRole("button", { name: "Begin the walkthrough", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: /Stop at Build/ }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: /Stop at Full/ }).click();
      await expect(
        page.getByRole("button", { name: /Stop at Full/ }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("button", { name: "Measure the sample", exact: true }),
      ).toBeVisible();
    });

    await test.step("the mirror has reachable controls and no desktop overlap", async () => {
      const mirror = await page.locator(".mirror-view").boundingBox();
      const rail = await page
        .getByRole("region", { name: "Current makeup instruction" })
        .boundingBox();
      expect(mirror).not.toBeNull();
      expect(rail).not.toBeNull();
      expect(mirror!.x + mirror!.width).toBeLessThanOrEqual(rail!.x);
      await checkAccessibility(page);
      await screenshot(page, testInfo, "desktop-mirror");
      await page.getByRole("button", { name: "Pause", exact: true }).focus();
      await tabTo(
        page,
        page.getByRole("button", { name: "Measure the sample", exact: true }),
      );

      await page.setViewportSize({ width: 390, height: 844 });
      await checkAccessibility(page);
      for (const name of ["Measure the sample", "Pause"]) {
        const bounds = await page
          .getByRole("button", { name, exact: true })
          .boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
      }
      await screenshot(page, testInfo, "mobile-mirror");
      await page.setViewportSize({ width: 1265, height: 712 });
    });

    await test.step("200% zoom reflows and keeps the instruction and controls reachable", async () => {
      // Chromium's half-size CSS viewport at DPR 2 renders the same physical
      // 1264 × 712 surface as 200% browser zoom. Vertical scrolling is allowed.
      const previousViewport = page.viewportSize() ?? {
        width: 1265,
        height: 712,
      };
      const cdp = await page.context().newCDPSession(page);
      try {
        // Keep Playwright's screenshot viewport in sync with CDP. Otherwise a
        // full-page capture can temporarily restore the desktop layout and crop it.
        await page.setViewportSize({ width: 632, height: 356 });
        expect(page.viewportSize()).toEqual({ width: 632, height: 356 });
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width: 632,
          height: 356,
          deviceScaleFactor: 2,
          mobile: false,
        });
        const metrics = await page.evaluate(() => ({
          width: innerWidth,
          scale: devicePixelRatio,
        }));
        expect(metrics).toEqual({ width: 632, scale: 2 });
        await checkAccessibility(page);
        const instruction = page
          .getByRole("region", {
            name: "Current makeup instruction",
            exact: true,
          })
          .getByRole("heading", { level: 2 });
        await expect(instruction).toBeVisible();
        await instruction.focus();
        await expect(instruction).toBeInViewport();
        const checkpoint = page.getByRole("button", {
          name: "Measure the sample",
          exact: true,
        });
        await checkpoint.scrollIntoViewIfNeeded();
        await expect(checkpoint).toBeInViewport();
        await checkpoint.focus();
        await tabTo(
          page,
          page.getByRole("button", { name: "Make this easier", exact: true }),
        );
        await screenshot(page, testInfo, "200-percent-reflow");
      } finally {
        await cdp.send("Emulation.clearDeviceMetricsOverride");
        await cdp.detach();
        await page.setViewportSize(previousViewport);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    });

    let confirmedId = "";
    await test.step("confirm a checkpoint and adapt only the remaining work", async () => {
      await page
        .getByRole("button", { name: "Measure the sample", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      const continueSample = page.getByRole("button", {
        name: "Continue the sample",
        exact: true,
      });
      await expect(continueSample).toBeVisible();
      const progress = page.getByRole("progressbar", {
        name: "Color change toward your chosen target",
      });
      await expect(progress).toBeVisible();
      expect(
        Number(await progress.getAttribute("aria-valuenow")),
      ).toBeGreaterThan(20);
      expect(Number(await progress.getAttribute("aria-valuenow"))).toBeLessThan(
        65,
      );
      await expect(
        page
          .locator('[aria-label="Measured color change heatmap"] > g > polygon')
          .first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Simulated checkpoint", exact: true }),
      ).toBeVisible();
      const measured = await sessionFrom(page, sessionId);
      expect(measured.observations.at(-1)?.measurement?.provenance).toBe(
        "simulated",
      );
      expect(measured.observations.at(-1)?.measurement?.targetLevel).toBe(
        "full",
      );
      expect(
        measured.assets.every((asset) => asset.purpose !== "checkpoint"),
      ).toBe(true);
      await screenshot(page, testInfo, "simulated-measurement-heatmap");
      await tabTo(page, continueSample);
      await page.keyboard.press("Enter");
      await expect(page.locator(".step-label")).toHaveText("Step 02 of 02");
      const before = await sessionFrom(page, sessionId);
      expect(before.completedActionIds).toHaveLength(1);
      confirmedId = before.completedActionIds[0];

      await page
        .getByRole("button", { name: "Make this easier", exact: true })
        .click();
      await page
        .getByRole("button", { name: "A different movement", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Use this change", exact: true }),
      ).toBeVisible();
      await checkAccessibility(page);
      await page
        .getByRole("button", { name: "Use this change", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Continue sample", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Measure the sample", exact: true }),
      ).toBeVisible();
      const after = await sessionFrom(page, sessionId);
      expect(after.completedActionIds).toEqual([confirmedId]);
      expect(after.activePlan?.actions[0].id).toBe(confirmedId);
    });

    await test.step("finish and save the sample without fabricating a physical outcome", async () => {
      await page
        .getByRole("button", { name: "Measure the sample", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Continue the sample", exact: true })
        .click();
      await page
        .getByRole("link", { name: "View my result", exact: true })
        .click();
      await page.waitForURL(/\/review$/);
      await expect(
        page.getByRole("heading", { level: 1 }),
      ).toHaveAccessibleName("A little closer to your way.");
      await page
        .getByRole("button", { name: "Finish the walkthrough", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Save this sample method", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Sample method saved", exact: true }),
      ).toBeDisabled();
      const completed = await sessionFrom(page, sessionId);
      expect(completed.stage).toBe("completed");
      expect(completed.savedMethod).toBe(true);
      expect(completed.outcome).toBeUndefined();
      expect(completed.completedActionIds).toContain(confirmedId);
      await checkAccessibility(page);
      await screenshot(page, testInfo, "sample-review");
    });

    await test.step("reuse starts a fresh personal setup and asks about current comfort", async () => {
      await page
        .getByRole("link", { name: "Your methods", exact: true })
        .first()
        .click();
      await page.waitForURL(/\/methods$/);
      await expect(
        page.getByRole("heading", { level: 1 }),
      ).toHaveAccessibleName("Ways that feel like you.");
      await expect(
        page.getByRole("link", { name: "Use this method", exact: true }),
      ).toHaveCount(1);
      await checkAccessibility(page);
      await page
        .getByRole("link", { name: "Use this method", exact: true })
        .click();
      await page.waitForURL(/\/studio\/new\?from=/);
      await expect(page.getByText(/A fresh start with/)).toBeVisible();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(
        page
          .getByRole("group", { name: "Tapping comfort", exact: true })
          .getByRole("radio", { name: "Not sure", exact: true }),
      ).toBeChecked();
      const source = await sessionFrom(page, sessionId);
      expect(source.stage).toBe("completed");
      expect(source.completedActionIds).toHaveLength(2);
    });

    await test.step("inspect data and explicitly delete the owned session", async () => {
      await page.goto("/settings/access");
      await expect(
        page.getByRole("heading", { level: 1 }),
      ).toHaveAccessibleName("A studio that moves with you.");
      await expect(
        page.getByRole("button", { name: "Save my preferences", exact: true }),
      ).toBeVisible();
      await checkAccessibility(page);
      await page.goto(`/studio/${sessionId}/review`);
      await page
        .getByRole("button", { name: "Delete this session", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Yes, delete this session", exact: true })
        .click();
      await page.waitForURL(/\/methods$/);
      await expect(
        page.getByRole("heading", {
          name: "A little space for your favorites.",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        (await page.request.get(`/api/sessions/${sessionId}`)).status(),
      ).toBe(404);
      sessionId = "";
    });
    expect(
      blockedPaidRequests,
      "The sample flow must never request paid processing.",
    ).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (sessionId)
      await page.request
        .delete(`/api/sessions/${sessionId}`, { timeout: 5000 })
        .catch(() => {});
  }
});

test("a resting budget disables fresh work while recorded stopping points and methods remain usable", async ({
  page,
}) => {
  const fixture = await installStudioFixture(page, { missingFull: true });
  await page.goto(`/studio/${fixture.id}/looks`);
  await expect(page.locator(".preview-explainer")).toContainText(
    "Fresh previews are resting",
  );
  await expect(
    page.getByRole("button", {
      name: "Generate fresh ladder · up to 1 unit",
      exact: true,
    }),
  ).toBeDisabled();
  const candidate = page.getByRole("article").first();
  await candidate.getByRole("button", { name: /Stop at Light/ }).click();
  await expect(
    candidate.getByRole("img", { name: /^light YouCam target/ }),
  ).toBeVisible();
  await expect(
    candidate.getByRole("button", { name: "Recorded YouCam", exact: true }),
  ).toBeVisible();
  await candidate
    .getByRole("button", { name: "Choose this method", exact: true })
    .click();
  await page.waitForURL(/\/mirror$/);
  await page
    .getByRole("button", { name: "Begin my method", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check this step", exact: true }),
  ).toBeVisible();
  expect(fixture.snapshot().activePlan?.selectedPreviewVariantId).toBe("light");
  expect(fixture.blockedRequests).toEqual([]);
});

test("one available method keeps its full heading and a useful desktop composition", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1265, height: 712 });
  const paidRequests: string[] = [];
  await page.route(paidOperations, (route) => {
    paidRequests.push(route.request().url());
    return route.fulfill({
      status: 503,
      json: {
        error: { message: "Paid processing is disabled in this UI test." },
      },
    });
  });
  await signInAnonymous(page.request);
  const created = await page.request.post("/api/sessions", {
    data: {
      ...SAMPLE_SETUP,
      consent: true,
      tools: ["fingertips"],
      products: ["cream_blush"],
      preferences: {
        ...SAMPLE_SETUP.preferences,
        movements: {
          tapping: "comfortable",
          blending: "avoid",
          short_strokes: "unknown",
        },
      },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const session = (await created.json()) as StudioSession;
  try {
    expect(session.candidates).toHaveLength(1);
    await page.goto(`/studio/${session.id}/looks`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      "A way to make it your own.",
    );
    const card = page.getByRole("article");
    await expect(card).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    const image = await card.locator(".candidate-visual").boundingBox();
    const details = await card.locator(".candidate-body").boundingBox();
    expect(image).not.toBeNull();
    expect(details).not.toBeNull();
    expect(details!.x).toBeGreaterThanOrEqual(image!.x + image!.width - 1);
    await checkAccessibility(page);
    await screenshot(page, testInfo, "one-method-desktop");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      "A way to make it your own.",
    );
    const mobileImage = await card.locator(".candidate-visual").boundingBox();
    const mobileDetails = await card.locator(".candidate-body").boundingBox();
    expect(mobileImage).not.toBeNull();
    expect(mobileDetails).not.toBeNull();
    expect(mobileDetails!.y).toBeGreaterThanOrEqual(
      mobileImage!.y + mobileImage!.height - 1,
    );
    await checkAccessibility(page);
    await screenshot(page, testInfo, "one-method-mobile");
    expect(paidRequests).toEqual([]);
  } finally {
    await page.request.delete(`/api/sessions/${session.id}`);
  }
});
