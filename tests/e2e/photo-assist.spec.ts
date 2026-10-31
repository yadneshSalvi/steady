import { expect, test, type Page, type Route } from "@playwright/test";
import { resolve } from "node:path";

const samplePhoto = resolve("public/images/studio-portrait.jpg");
const secondPhoto = resolve("public/images/inspiration-berry.jpg");
const suggestion = (description: string) => ({
  lookId: "berry",
  attributes: ["Berry color family"],
  description,
  uncertainties: [],
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function fulfillAbortedRequest(route: Route, description: string) {
  // These cases deliberately abort a client request before its response arrives.
  try {
    await route.fulfill({ json: suggestion(description) });
  } catch {
    /* The client already discarded it. */
  }
}

async function openInspiration(page: Page) {
  await page.goto("/studio/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    "Let’s begin with you.",
  );
  await page.getByText("Start from a photo you love", { exact: true }).click();
}

async function selectPhoto(page: Page, path: string) {
  await page
    .getByLabel("Choose an inspiration reference", { exact: true })
    .setInputFiles(path);
  await page
    .getByRole("checkbox", { name: /I have permission to use this image/ })
    .check();
}

test.beforeEach(async ({ page }) => {
  // These are client-race tests. No database account or inference call is needed.
  await page.route(/\/api\/auth\/get-session(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        session: {
          id: "mock-photo-session",
          userId: "mock-photo-owner",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        user: {
          id: "mock-photo-owner",
          name: "UI test",
          email: "ui-test@example.test",
          emailVerified: false,
        },
      },
    }),
  );
  await page.route(
    /\/api\/(?:tool-suggestions|voice\/transcribe|sessions\/[^/]+\/(?:previews|checkpoint-analysis))(?:\?|$)/,
    (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: { message: "Paid processing is disabled in this UI test." },
        },
      }),
  );
});

test("a late interpretation cannot replace the newly selected photo", async ({
  page,
}) => {
  const releaseOld = gate();
  const oldResponseFinished = gate();
  let requests = 0;
  await page.route("**/api/inspiration", async (route) => {
    requests += 1;
    if (requests === 1) {
      await releaseOld.promise;
      await fulfillAbortedRequest(
        route,
        "Old image interpretation must not appear.",
      );
      oldResponseFinished.release();
    } else {
      await route.fulfill({
        json: suggestion("The newest selected image was interpreted."),
      });
    }
  });

  try {
    await openInspiration(page);
    await selectPhoto(page, samplePhoto);
    const firstRequest = page.waitForRequest("**/api/inspiration");
    await page
      .getByRole("button", { name: "Interpret this inspiration", exact: true })
      .click();
    await firstRequest;

    await page
      .getByRole("button", { name: "Choose again", exact: true })
      .click();
    await selectPhoto(page, secondPhoto);
    await page
      .getByRole("button", { name: "Interpret this inspiration", exact: true })
      .click();
    await expect(
      page.getByText("The newest selected image was interpreted.", {
        exact: true,
      }),
    ).toBeVisible();

    releaseOld.release();
    await oldResponseFinished.promise;
    await expect(
      page.getByText("Old image interpretation must not appear.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText("The newest selected image was interpreted.", {
        exact: true,
      }),
    ).toBeVisible();

    // A suggestion does not change the chosen goal until explicitly accepted.
    await expect(
      page.locator(".look-choice[aria-pressed=true] .look-choice-name"),
    ).toHaveText("A little rose");
    await page
      .getByRole("button", { name: "Use this interpretation", exact: true })
      .click();
    await expect(
      page.locator(".look-choice[aria-pressed=true] .look-choice-name"),
    ).toHaveText("Berry, softly");
    expect(requests).toBe(2);
  } finally {
    releaseOld.release();
  }
});

test("stopping an interpretation restores the selected-photo controls", async ({
  page,
}) => {
  const releaseResponse = gate();
  const responseFinished = gate();
  await page.route("**/api/inspiration", async (route) => {
    await releaseResponse.promise;
    await fulfillAbortedRequest(
      route,
      "Cancelled interpretation must not appear.",
    );
    responseFinished.release();
  });
  try {
    await openInspiration(page);
    await selectPhoto(page, samplePhoto);
    const request = page.waitForRequest("**/api/inspiration");
    await page
      .getByRole("button", { name: "Interpret this inspiration", exact: true })
      .click();
    await request;
    await page
      .getByRole("button", { name: "Stop this request", exact: true })
      .click();
    await expect(page.locator(".notice[role=alert]")).toContainText(
      "This request was stopped.",
    );
    await expect(
      page.getByRole("button", {
        name: "Interpret this inspiration",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      page.getByRole("img", {
        name: "Your inspiration reference",
        exact: true,
      }),
    ).toBeVisible();

    releaseResponse.release();
    await responseFinished.promise;
    await expect(
      page.getByText("Cancelled interpretation must not appear.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Use this interpretation",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    releaseResponse.release();
  }
});

test("the 90-second deadline is recoverable and discards its late response", async ({
  page,
}) => {
  // Advance the browser clock, not the test or an upstream provider's deadline.
  await page.clock.install();
  const releaseResponse = gate();
  const responseFinished = gate();
  await page.route("**/api/inspiration", async (route) => {
    await releaseResponse.promise;
    await fulfillAbortedRequest(
      route,
      "Timed-out interpretation must not appear.",
    );
    responseFinished.release();
  });
  try {
    await openInspiration(page);
    await selectPhoto(page, samplePhoto);
    const request = page.waitForRequest("**/api/inspiration");
    await page
      .getByRole("button", { name: "Interpret this inspiration", exact: true })
      .click();
    await request;
    await page.clock.fastForward(90_001);
    await expect(page.locator(".notice[role=alert]")).toContainText(
      "taking longer than expected",
    );
    await expect(
      page.getByRole("button", {
        name: "Interpret this inspiration",
        exact: true,
      }),
    ).toBeEnabled();

    releaseResponse.release();
    await responseFinished.promise;
    await expect(
      page.getByText("Timed-out interpretation must not appear.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Use this interpretation",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    releaseResponse.release();
  }
});
