import { test, expect } from "@playwright/test";
import { SAMPLE_SETUP } from "../../src/lib/catalog";
import type { StudioSession } from "../../src/lib/contracts";
import { signInAnonymous } from "./support/auth";

test("actual local model tracks a synthetic video fixture without uploading frames", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // This is a generated adult image rendered as a video stream, not a participant or hardware-camera result.
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const image = new Image();
        image.src = "/images/studio-portrait.jpg";
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 800;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0, 640, 800);
        const timer = window.setInterval(
          () => ctx.drawImage(image, 0, 0, 640, 800),
          90,
        );
        const stream = canvas.captureStream(12);
        stream
          .getVideoTracks()[0]
          .addEventListener("ended", () => clearInterval(timer));
        return stream;
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signInAnonymous(page.request);
  const created = await page.request.post("/api/sessions", {
    data: { ...SAMPLE_SETUP, mode: "personal", consent: true },
  });
  expect(created.status(), await created.text()).toBe(201);
  let session = (await created.json()) as StudioSession;
  const selected = await page.request.post(
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
  expect(selected.ok(), await selected.text()).toBe(true);
  session = await selected.json();
  await page.goto(`/studio/${session.id}/mirror`);
  await page.getByRole("button", { name: "Open my camera" }).click();
  await expect(
    page.getByLabel("Live camera in mirror view, unretouched"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Begin my method" }).click();
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/"))
      calls.push(request.url());
  });
  await expect(page.locator(".face-guide")).toContainText(
    "Placement guide · processed on this device",
    { timeout: 60_000 },
  );
  await expect(page.locator(".face-guide polygon")).toBeVisible();
  await page.screenshot({
    path: "test-results/local-model-synthetic-video.png",
  });
  expect(
    calls.filter((url) =>
      /upload|inspiration|checkpoint-analysis|tool-suggestions/.test(url),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
  await page
    .getByRole("button", { name: "Pause", exact: true })
    .first()
    .click();
  await expect(page.locator(".face-guide")).toHaveCount(0);
});
