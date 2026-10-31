import { test, expect, type Page } from "@playwright/test";
import { SAMPLE_SETUP } from "../../src/lib/catalog";
import type { StudioSession } from "../../src/lib/contracts";
import { signInAnonymous } from "./support/auth";

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
  const consent = page.getByRole("checkbox", {
    name: /I understand this is a synthetic/,
  });
  await consent.check();
  await page
    .getByRole("button", { name: "Find my methods", exact: true })
    .click();
  await expect(
    page.getByText(/Please wait 10 seconds, then try again/),
  ).toBeVisible();
  await expect(consent).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Find my methods", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Opening your studio…", exact: true }),
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

test("camera denial keeps manual checkpoint and physical confirmation available", async ({
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
    "Text guidance and manual checkpoints remain available",
  );
  await page.getByRole("button", { name: "Begin my method" }).click();
  await page
    .getByRole("button", { name: "Check this step", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use my judgment without a photo" })
    .click();
  await expect(
    page.getByRole("button", { name: "I’m ready for the next step" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I’m ready for the next step" })
    .click();
  const state = (await (
    await page.request.get(`/api/sessions/${id}`)
  ).json()) as StudioSession;
  expect(state.completedActionIds).toHaveLength(1);
  expect(state.observations[0].method).toBe("user_judgment_only_v1");
  expect(state.observations[0].assetId).toBeUndefined();
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
  await page.getByText("Voice controls · optional", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Enable voice controls" }),
  ).toBeDisabled();
  await page
    .getByLabel(
      "I agree to send short microphone clips to Deepgram while voice controls are on.",
    )
    .check();
  await page.getByRole("button", { name: "Enable voice controls" }).click();
  await expect(page.locator(".voice-controls")).toContainText(
    "Listening · say",
  );
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
