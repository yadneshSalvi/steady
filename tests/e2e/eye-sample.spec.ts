import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { StudioSession } from "../../src/lib/contracts";
import { signInAnonymous } from "./support/auth";

test("recorded eye sample keeps a completed liner eye while repairing the remaining eye to shadow", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const paidRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(
    /\/api\/(?:assets\/|inspiration|tool-suggestions|voice\/transcribe|sessions\/[^/]+\/(?:previews|checkpoint-analysis))/,
    async (route) => {
      paidRequests.push(new URL(route.request().url()).pathname);
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "TEST_PROCESSING_DISABLED",
            message: "Recorded sample only; no fresh processing is permitted.",
          },
        },
      });
    },
  );
  await signInAnonymous(page.request);
  let id = "";
  async function saved(): Promise<StudioSession> {
    const response = await page.request.get(`/api/sessions/${id}`);
    expect(response.ok()).toBe(true);
    return response.json();
  }
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore the eye sample", exact: true })
      .click();
    await page.waitForURL(/\/studio\/[^/]+\/looks$/);
    id = new URL(page.url()).pathname.split("/")[2];
    const liner = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "Fine upper liner",
        exact: true,
      }),
    });
    await expect(liner).toHaveCount(1);
    const targetStage = page.getByRole("region", {
      name: "Your shared color target",
    });
    await expect(
      targetStage.getByRole("button", { name: /Stop at Build/ }),
    ).toHaveCount(0);
    await expect(
      targetStage.getByRole("button", { name: /Stop at Light/ }),
    ).toBeVisible();
    await expect(
      targetStage.getByRole("img", { name: /^full YouCam target/ }),
    ).toBeVisible();
    await expect(page.locator(".sample-badge")).toHaveCount(1);
    await expect(page.locator(".provenance")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Generate previews|Generate target/ }),
    ).toHaveCount(0);
    await liner.getByRole("button", { name: "Choose", exact: true }).click();
    await page.waitForURL(/\/mirror$/);
    const original = await saved();
    expect(
      original.activePlan?.recipe.some(
        (effect) => effect.category === "eye_liner",
      ),
    ).toBe(true);
    const originalTarget = original.activePlan!.previewAsset!.id;
    const completedAction = structuredClone(original.activePlan!.actions[0]);
    await page
      .getByRole("button", { name: "Begin the walkthrough", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Measure the sample", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Done with this step", exact: true }),
    ).toBeVisible();
    expect((await saved()).completedActionIds).toEqual([]);
    await page
      .getByRole("button", { name: "Done with this step", exact: true })
      .click();
    await expect(page.locator(".step-label")).toHaveText("Step 02 of 02");
    await page
      .getByRole("button", { name: "Make this easier", exact: true })
      .click();
    await page
      .getByRole("button", { name: "A different movement", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Use this change", exact: true }),
    ).toBeVisible();
    const proposed = await saved();
    expect(proposed.adaptation?.candidate.routeId).toBe("shadow");
    expect(proposed.adaptation?.changesGoal).toBe(true);
    expect(proposed.adaptation?.preservedActionIds).toEqual([
      completedAction.id,
    ]);
    expect(proposed.adaptation?.candidate.actions[0]).toEqual(completedAction);
    expect(proposed.adaptation?.candidate.actions[1]).toMatchObject({
      region: "right_eye",
      motion: "tapping",
      product: "eye_shadow",
    });
    expect(proposed.adaptation?.candidate.previewAsset?.id).not.toBe(
      originalTarget,
    );
    expect(proposed.adaptation?.candidate.previewAsset?.url).toMatch(
      /\/round3\/shadow-full-warm-v4\.png$/,
    );
    await expect(page.getByText(/two sides may differ/)).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("liner-to-shadow-repair.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Use this change", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue sample", exact: true })
      .click();
    await expect(page.locator(".step-label")).toHaveText("Step 02 of 02");
    const adapted = await saved();
    expect(adapted.completedActionIds).toEqual([completedAction.id]);
    expect(adapted.activePlan?.actions[0]).toEqual(completedAction);
    expect(
      adapted.activePlan?.recipe.some(
        (effect) => effect.category === "eye_shadow",
      ),
    ).toBe(true);
    expect(adapted.activePlan?.previewAsset?.url).toMatch(
      /\/round3\/shadow-full-warm-v4\.png$/,
    );
    await page
      .getByRole("button", { name: "Measure the sample", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Done with this step", exact: true })
      .click();
    await page.waitForURL(/\/review$/);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect.poll(async () => (await saved()).stage).toBe("completed");
    const result = await saved();
    expect(result.completedActionIds).toHaveLength(2);
    expect(result.completedActionIds[0]).toBe(completedAction.id);
    expect(result.outcome).toBeUndefined();
    expect(paidRequests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (id)
      await page.request
        .delete(`/api/sessions/${id}`, { timeout: 5000 })
        .catch(() => {});
  }
});
