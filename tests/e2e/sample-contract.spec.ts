import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_SETUP } from "../../src/lib/catalog";
import type { StudioSession } from "../../src/lib/contracts";
import { signInAnonymous } from "./support/auth";

async function personalLipSetup(page: Page) {
  await page.goto("/studio/new");
  await page
    .getByRole("checkbox", { name: /Add a touch of lip color/ })
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("group", { name: "Tapping comfort", exact: true })
    .getByRole("radio", { name: "Feels good", exact: true })
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

test("recorded sample contract clears personal lip color on photo-mode switch and rejects it through the API", async ({
  page,
  baseURL,
}) => {
  const origin = baseURL || "http://localhost:3000";
  await signInAnonymous(page.request, origin);
  const invalid = await page.request.post("/api/sessions", {
    headers: { Origin: origin },
    data: {
      ...structuredClone(SAMPLE_SETUP),
      includeLips: true,
      consent: true,
    },
  });
  expect(invalid.status()).toBe(400);
  let freshRequests = 0;
  await page.route("**/api/sessions/*/previews", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    freshRequests++;
    await route.fulfill({
      status: 503,
      json: {
        error: { message: "Fresh processing is disabled in this test." },
      },
    });
  });
  let created: StudioSession | undefined;
  try {
    await personalLipSetup(page);
    await page.getByRole("checkbox", { name: /^Fingertips/ }).check();
    await page.getByRole("checkbox", { name: /^Cream blush/ }).check();
    await page.getByRole("checkbox", { name: /^Lip color/ }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Use the sample", exact: true })
      .click();
    await expect(page.locator(".sample-badge")).toHaveCount(1);
    for (let step = 0; step < 3; step++)
      await page.getByRole("button", { name: "Back", exact: true }).click();
    const lipOption = page.getByRole("checkbox", {
      name: /Add a touch of lip color/,
    });
    await expect(lipOption).toHaveCount(0);
    for (let step = 0; step < 3; step++)
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Find my methods", exact: true }),
    ).toBeEnabled();
    const response = page.waitForResponse(
      (item) =>
        item.url().endsWith("/api/sessions") &&
        item.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Find my methods", exact: true })
      .click();
    created = await (await response).json();
    expect(created!.mode).toBe("sample");
    expect(created!.includeLips).toBe(false);
    expect(
      created!.candidates.every((candidate) =>
        candidate.previewVariants?.every(
          (variant) =>
            variant.previewStatus === "ready" &&
            !!variant.previewAsset?.recordedAt,
        ),
      ),
    ).toBe(true);
    await page.waitForURL(`**/studio/${created!.id}/looks`);
    await expect(
      page.getByRole("img", { name: /^full YouCam target/ }),
    ).toBeVisible();
    expect(freshRequests).toBe(0);
  } finally {
    if (created?.id)
      await page.request.delete(`/api/sessions/${created.id}`, {
        headers: { Origin: origin },
      });
  }
});

test("recorded sample contract clears lip color when fictional workbench suggestions switch modes", async ({
  page,
}) => {
  await page.route(/\/api\/auth\/get-session(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        session: {
          id: "sample-contract",
          userId: "sample-contract",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        user: {
          id: "sample-contract",
          name: "Synthetic test",
          email: "sample@example.test",
          emailVerified: false,
        },
      },
    }),
  );
  await page.route("**/api/tool-suggestions", (route) =>
    route.fulfill({
      json: {
        tools: ["sponge"],
        products: ["cream_blush"],
        notes: ["Confirm the fictional example items."],
      },
    }),
  );
  await personalLipSetup(page);
  await page.getByText("Photograph your workbench", { exact: true }).click();
  await page
    .getByRole("button", { name: "Try a sample workbench", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Send this permitted image to Gemini or OpenAI.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Suggest my tools", exact: true })
    .click();
  const suggestions = page.locator(".photo-assist-result");
  await suggestions
    .getByRole("checkbox", { name: "Makeup sponge", exact: true })
    .check();
  await suggestions
    .getByRole("checkbox", { name: "Cream blush", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm sample items", exact: true })
    .click();
  for (let step = 0; step < 2; step++)
    await page.getByRole("button", { name: "Back", exact: true }).click();
  const lipOption = page.getByRole("checkbox", {
    name: /Add a touch of lip color/,
  });
  await expect(lipOption).toHaveCount(0);
});
