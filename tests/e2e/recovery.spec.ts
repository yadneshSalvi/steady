import { test, expect, type Page } from "@playwright/test";
import { SAMPLE_SETUP } from "../../src/lib/catalog";
import type { StudioSession } from "../../src/lib/contracts";
import { signInAnonymous } from "./support/auth";
import { installStudioFixture } from "./support/studio-fixture";

test("editing an existing setup keeps its starting photo and saves into the same studio", async ({
  page,
}) => {
  const fixture = await installStudioFixture(page);
  const sourceId = fixture.snapshot().sourceAssetId;
  await page.goto(`/studio/new?edit=${fixture.id}`);
  await expect(
    page.getByText("Your setup, ready to adjust", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox", { name: /^Fingertips/ }).uncheck();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Your saved starting photo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your starting photo is kept.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Find my methods", exact: true })
    .click();
  await page.waitForURL(`**/studio/${fixture.id}/looks`);
  expect(fixture.snapshot().sourceAssetId).toBe(sourceId);
  expect(fixture.snapshot().tools).not.toContain("fingertips");
  expect(
    fixture.commands.filter((command) => command.type === "update_setup"),
  ).toHaveLength(1);
  expect(fixture.blockedRequests).toEqual([]);
});

test("a stage conflict preserves its specific recovery message", async ({
  page,
}) => {
  const fixture = await installStudioFixture(page);
  await page.route(`**/api/sessions/${fixture.id}/events`, async (route) => {
    if (route.request().postDataJSON().command.type !== "select_preview_level")
      return route.fallback();
    await route.fulfill({
      status: 409,
      json: {
        error: {
          code: "PREVIEW_STAGE",
          message:
            "Return to your active method before changing its stopping point.",
        },
      },
    });
  });
  await page.goto(`/studio/${fixture.id}/looks`);
  await page
    .getByRole("region", { name: "Your shared color target" })
    .getByRole("button", { name: /Stop at Build/ })
    .click();
  await expect(
    page.getByText(
      "Return to your active method before changing its stopping point.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/updated in another view/)).toHaveCount(0);
  expect(fixture.blockedRequests).toEqual([]);
});

test("setup explains an unknown movement and incompatible tools before asking for a photo", async ({
  page,
}) => {
  await page.goto("/studio/new");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Tapping comfort", exact: true })
      .getByRole("radio", { name: "Not sure", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText(/Confirm at least one movement that feels good/),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Tapping comfort", exact: true })
    .getByRole("radio", { name: "Feels good", exact: true })
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox", { name: /^Fingertips/ }).check();
  await page.getByRole("checkbox", { name: /^Powder blush/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No method fits yet" }),
  ).toContainText("Pair a comfortable movement with its tool and product");
  await expect(page.locator(".setup-feasibility")).toHaveText(
    "No method fits yet",
  );
  await expect(
    page.getByLabel("Choose your starting photo", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("checkbox", { name: /^Powder blush/ }).uncheck();
  await page.getByRole("checkbox", { name: /^Cream blush/ }).check();
  await expect(page.locator(".setup-feasibility")).toContainText(
    "1 method fits",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByLabel("Choose your starting photo", { exact: true }),
  ).toBeVisible();
});

test("sign-in burst limit ends the spinner and preserves a retryable setup", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: null }),
  );
  await page.route("**/api/auth/sign-in/anonymous", (route) => {
    attempts += 1;
    return route.fulfill({
      status: 429,
      headers: { "X-Retry-After": "10" },
      json: { message: "Too many requests. Please try again later." },
    });
  });
  await page.goto("/studio/new?mode=sample");
  for (let step = 0; step < 3; step += 1)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".sample-badge")).toHaveCount(1);
  await expect(
    page.getByRole("checkbox", { name: /I understand this is a synthetic/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Find my methods", exact: true })
    .click();
  await expect(
    page.getByText(/Please wait 10 seconds, then try again/),
  ).toBeVisible();
  await expect(page.locator(".sample-badge")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Find my methods", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Opening studio…", exact: true }),
  ).toHaveCount(0);
  expect(attempts).toBe(1);
  await page
    .getByRole("button", { name: "Find my methods", exact: true })
    .click();
  await expect.poll(() => attempts).toBe(2);
  await expect(
    page.getByRole("button", { name: "Find my methods", exact: true }),
  ).toBeEnabled();
});

async function readyStudio(page: Page, mode: "sample" | "personal") {
  await signInAnonymous(page.request);
  const created = await page.request.post("/api/sessions", {
    data: { ...SAMPLE_SETUP, mode, consent: true },
  });
  expect(created.status()).toBe(201);
  const session = (await created.json()) as StudioSession;
  const approved = await page.request.post(
    `/api/sessions/${session.id}/events`,
    {
      data: {
        expectedRevision: session.revision,
        command: {
          type: "approve_candidate",
          candidateId: session.candidates[0].id,
        },
      },
    },
  );
  expect(approved.ok()).toBe(true);
  await page.goto(`/studio/${session.id}/mirror`);
  return session.id;
}

test("camera denial keeps direct confirmation and optional checkpoint upload available", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("Simulated denial", "NotAllowedError");
      },
    }),
  );
  const id = await readyStudio(page, "personal");
  await page.getByRole("button", { name: "Open my camera" }).click();
  await expect(page.locator(".camera-permission-error")).toContainText(
    "Camera access is off.",
  );
  await page.getByRole("button", { name: "Begin my method" }).click();
  await page
    .getByRole("button", { name: "Measure this step", exact: true })
    .click();
  await expect(
    page.getByLabel("Add a checkpoint photo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Done with this step" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done with this step" }).click();
  await expect(page.locator(".step-label")).toHaveText("Step 02 of 02");
  const state = (await (
    await page.request.get(`/api/sessions/${id}`)
  ).json()) as StudioSession;
  expect(state.completedActionIds).toHaveLength(1);
  expect(state.observations).toEqual([]);
  expect(state.assets.every((asset) => asset.purpose !== "checkpoint")).toBe(
    true,
  );
  expect(state.outcome).toBeUndefined();
});

test("optional microphone detects a short synthetic utterance and executes a bounded command", async ({
  page,
}) => {
  // A generated tone exercises browser recording/VAD. Recognition is mocked;
  // real synthesized speech is separately tested against the live server route.
  await page.addInitScript(() => {
    type TestWindow = Window & {
      __steadyTone?: () => Promise<void>;
      __steadyMic?: MediaStream;
    };
    const target = window as TestWindow;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const audio = new AudioContext();
        await audio.resume();
        const destination = audio.createMediaStreamDestination();
        target.__steadyMic = destination.stream;
        target.__steadyTone = async () => {
          await audio.resume();
          const tone = audio.createOscillator();
          const gain = audio.createGain();
          gain.gain.value = 0.2;
          tone.frequency.value = 300;
          tone.connect(gain).connect(destination);
          tone.start();
          tone.stop(audio.currentTime + 1);
        };
        return destination.stream;
      },
    });
  });
  let recordings = 0;
  await page.route("**/api/voice/transcribe", async (route) => {
    recordings++;
    expect(route.request().headers()["x-steady-voice-consent"]).toBe(
      "deepgram-v1",
    );
    expect(route.request().postDataBuffer()!.byteLength).toBeGreaterThan(128);
    await route.fulfill({ json: { command: "pause", heard: "Steady, pause" } });
  });
  const id = await readyStudio(page, "sample");
  await page.getByRole("button", { name: "Begin the walkthrough" }).click();
  await page.getByRole("button", { name: /^Comfort & controls/ }).click();
  await page.getByText("Voice controls", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Enable voice controls" }),
  ).toBeDisabled();
  await page.getByLabel("Send short mic clips to Deepgram while on.").check();
  await page.getByRole("button", { name: "Enable voice controls" }).click();
  await expect(page.locator(".voice-controls")).toContainText(
    "Listening · say",
  );
  await page
    .getByRole("button", { name: "Close controls", exact: true })
    .click();
  await expect(page.getByLabel("Microphone on", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    (
      window as Window & { __steadyTone?: () => Promise<void> }
    ).__steadyTone?.(),
  );
  await expect.poll(() => recordings, { timeout: 15_000 }).toBe(1);
  await expect(page.locator(".pause-panel")).toBeVisible({ timeout: 15_000 });
  expect(recordings).toBe(1);
  const state = (await (
    await page.request.get(`/api/sessions/${id}`)
  ).json()) as StudioSession;
  expect(state.stage).toBe("paused");
  expect(state.completedActionIds).toHaveLength(0);
  await page.getByRole("button", { name: /^Comfort & controls/ }).click();
  if (
    !(await page
      .locator(".voice-controls")
      .evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await page.locator(".voice-controls summary").click();
  }
  await expect(page.locator(".voice-controls")).toContainText(
    "Voice controls · on",
  );
  await page.getByRole("button", { name: "Turn microphone off" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & { __steadyMic?: MediaStream }).__steadyMic
          ?.getTracks()
          .every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
});

test("a rate-limited session read preserves the owner and saved studio intent", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const origin = baseURL || "http://localhost:3000";
  await signInAnonymous(page.request, origin);
  const created = await page.request.post("/api/sessions", {
    headers: { Origin: origin },
    data: { ...structuredClone(SAMPLE_SETUP), lookId: "berry", consent: true },
  });
  expect(created.status()).toBe(201);
  let saved = (await created.json()) as StudioSession;
  try {
    for (const command of [
      {
        type: "select_preview_level",
        candidateId: saved.candidates[0].id,
        level: "build",
      },
      { type: "approve_candidate", candidateId: saved.candidates[0].id },
    ] as const) {
      const response = await page.request.post(
        `/api/sessions/${saved.id}/events`,
        {
          headers: { Origin: origin },
          data: { expectedRevision: saved.revision, command },
        },
      );
      expect(response.status()).toBe(200);
      saved = await response.json();
    }
    const cookieBefore = (await page.context().cookies()).find((cookie) =>
      cookie.name.endsWith("session_token"),
    );
    expect(Boolean(cookieBefore?.value)).toBe(true);
    let sessionReads = 0,
      anonymousPosts = 0,
      sessionPosts = 0,
      previewPosts = 0;
    await page.route(/\/api\/auth\/get-session(?:\?.*)?$/, async (route) => {
      sessionReads++;
      if (sessionReads === 1)
        await route.fulfill({
          status: 429,
          headers: { "X-Retry-After": "0" },
          json: { message: "Synthetic session read limit" },
        });
      else await route.continue();
    });
    await page.route(
      /\/api\/(?:auth\/sign-in\/anonymous|sessions(?:\/.*)?)$/,
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/anonymous")) anonymousPosts++;
        else if (path.endsWith("/previews")) previewPosts++;
        else sessionPosts++;
        await route.abort("blockedbyclient");
      },
    );
    const recovered = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/sessions/${saved.id}` &&
        response.request().method() === "GET",
    );
    await page.goto(`/studio/${saved.id}/mirror`);
    expect((await recovered).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "Begin the walkthrough", exact: true }),
    ).toBeVisible();
    expect(sessionReads).toBe(2);
    expect(anonymousPosts).toBe(0);
    expect(sessionPosts).toBe(0);
    expect(previewPosts).toBe(0);
    const cookieAfter = (await page.context().cookies()).find(
      (cookie) => cookie.name === cookieBefore!.name,
    );
    expect(Boolean(cookieAfter?.value)).toBe(true);
    // Compare the actual cookie without exposing either token on failure.
    expect(cookieAfter!.value === cookieBefore!.value).toBe(true);
    const response = await page.request.get(`/api/sessions/${saved.id}`);
    expect(response.status()).toBe(200);
    const current = (await response.json()) as StudioSession;
    expect(current).toEqual(saved);
    expect(current.activePlan?.selectedPreviewVariantId).toBe("build");
    expect(current.activePlan?.previewAsset?.recordedAt).toBeTruthy();
  } finally {
    const removed = await page.request.delete(`/api/sessions/${saved.id}`, {
      headers: { Origin: origin },
    });
    expect(removed.status()).toBe(200);
  }
});
