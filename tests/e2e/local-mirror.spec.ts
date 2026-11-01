import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { REFERENCE_LANDMARKS } from "../../src/lib/vision/measure";
import recordedLandmarks from "../fixtures/sample-landmarks.json" with { type: "json" };
import { installStudioFixture, ladder } from "./support/studio-fixture";

type FrameOptions = { rotate?: number; uneven?: boolean };
type FixtureWindow = Window & {
  __steadyFrame?: (url: string, options?: FrameOptions) => Promise<void>;
  __steadyCameraRequests?: number;
};

async function syntheticCamera(page: Page) {
  const points = REFERENCE_LANDMARKS.heldOut.map(
    (index) => recordedLandmarks.points[index],
  );
  const patch = {
    x: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    y: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
  await page.addInitScript(
    ({ patch, source }) => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          (window as FixtureWindow).__steadyCameraRequests =
            ((window as FixtureWindow).__steadyCameraRequests ?? 0) + 1;
          const canvas = document.createElement("canvas");
          canvas.width = 1024;
          canvas.height = 1280;
          const context = canvas.getContext("2d")!;
          let current: HTMLCanvasElement;
          const paint = async (url: string, options: FrameOptions = {}) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            const frame = document.createElement("canvas");
            frame.width = canvas.width;
            frame.height = canvas.height;
            const drawing = frame.getContext("2d", {
              willReadFrequently: true,
            })!;
            drawing.fillStyle = "#baa595";
            drawing.fillRect(0, 0, frame.width, frame.height);
            drawing.save();
            drawing.translate(frame.width / 2, frame.height / 2);
            drawing.rotate(((options.rotate ?? 0) * Math.PI) / 180);
            drawing.drawImage(
              image,
              -frame.width / 2,
              -frame.height / 2,
              frame.width,
              frame.height,
            );
            drawing.restore();
            if (options.uneven) {
              const pixels = drawing.getImageData(
                0,
                0,
                frame.width,
                frame.height,
              );
              for (
                let y = Math.floor(patch.y * frame.height);
                y < Math.ceil(patch.bottom * frame.height);
                y++
              )
                for (
                  let x = Math.floor(patch.x * frame.width);
                  x < Math.ceil(patch.right * frame.width);
                  x++
                )
                  for (let channel = 0; channel < 3; channel++) {
                    const index = (y * frame.width + x) * 4 + channel;
                    const value = pixels.data[index] / 255;
                    const linear =
                      (value <= 0.04045
                        ? value / 12.92
                        : ((value + 0.055) / 1.055) ** 2.4) * 0.6;
                    pixels.data[index] = Math.round(
                      255 *
                        (linear <= 0.0031308
                          ? linear * 12.92
                          : 1.055 * linear ** (1 / 2.4) - 0.055),
                    );
                  }
              drawing.putImageData(pixels, 0, 0);
            }
            current = frame;
            context.drawImage(frame, 0, 0);
          };
          await paint(source);
          (window as FixtureWindow).__steadyFrame = paint;
          const timer = window.setInterval(
            () => context.drawImage(current, 0, 0),
            80,
          );
          const stream = canvas.captureStream(12);
          stream
            .getVideoTracks()[0]
            .addEventListener("ended", () => clearInterval(timer));
          return stream;
        },
      });
    },
    { patch, source: ladder.source.url },
  );
}

async function setFrame(page: Page, url: string, options: FrameOptions = {}) {
  await page.evaluate(
    async ({ url, options }) => {
      await (window as FixtureWindow).__steadyFrame!(url, options);
      const video = document.querySelector("video")!;
      for (let frame = 0; frame < 2; frame++)
        await new Promise<void>((resolve) =>
          video.requestVideoFrameCallback(() => resolve()),
        );
    },
    { url, options },
  );
}

test("real IMAGE and VIDEO models measure synthetic Light→Full pixels and abstain on lighting or pose drift without uploading frames", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  // Real on-device models over a synthetic video; not a physical usability,
  // hardware-camera performance, or participant-outcome evaluation.
  const fixture = await installStudioFixture(page);
  await syntheticCamera(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/studio/${fixture.id}/mirror`);
  await page
    .getByRole("button", { name: "Open my camera", exact: true })
    .click();
  await expect(
    page.getByLabel("Live camera in mirror view, unretouched"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Begin my method", exact: true })
    .click();
  await expect(page.locator(".baseline-status")).toContainText(
    "Baseline captured",
    { timeout: 60_000 },
  );
  await expect(page.locator(".face-guide polygon")).toBeVisible();
  const originalVideo = await page.locator("video").elementHandle();
  const originalTrack = await page
    .locator("video")
    .evaluate(
      (video) =>
        (
          (video as HTMLVideoElement).srcObject as MediaStream
        ).getVideoTracks()[0].id,
    );
  const assertSameCamera = async () => {
    expect(await originalVideo!.evaluate((video) => video.isConnected)).toBe(
      true,
    );
    expect(
      await page.locator("video").evaluate((video) => {
        const media = video as HTMLVideoElement;
        const track = (media.srcObject as MediaStream).getVideoTracks()[0];
        return { id: track.id, state: track.readyState, paused: media.paused };
      }),
    ).toEqual({ id: originalTrack, state: "live", paused: false });
    expect(
      await page.evaluate(
        () => (window as FixtureWindow).__steadyCameraRequests,
      ),
    ).toBe(1);
  };
  const light = ladder.records.find(
    (record) =>
      record.lookId === "rose" &&
      record.texture === "satin" &&
      record.level === "light",
  )!;
  const full = ladder.records.find(
    (record) =>
      record.lookId === "rose" &&
      record.texture === "satin" &&
      record.level === "full",
  )!;
  const progress = page.getByRole("progressbar", {
    name: "Color change toward your chosen target",
  });
  let observationCount = 0;
  async function check() {
    await page
      .getByRole("button", { name: "Measure this step", exact: true })
      .click();
    observationCount++;
    await expect
      .poll(() => fixture.snapshot().observations.length)
      .toBe(observationCount);
    await expect(
      page.getByRole("button", {
        name: "Done with this step",
        exact: true,
      }),
    ).toBeVisible();
    return fixture.snapshot().observations.at(-1)!.measurement!;
  }
  async function close() {
    await page
      .getByRole("button", { name: "Close checkpoint", exact: true })
      .click();
  }

  await setFrame(page, light.output.url);
  const measuredLight = await check();
  expect(measuredLight.provenance).toBe("local_camera");
  expect(measuredLight.verdict).toBe("build");
  expect(measuredLight.progress).toBeGreaterThan(0.2);
  expect(measuredLight.progress).toBeLessThan(0.65);
  await expect(progress).toBeVisible();
  await expect(
    page
      .locator('[aria-label="Measured color change heatmap"] > g > polygon')
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide heatmap", exact: true }).click();
  await expect(
    page.locator('[aria-label="Measured color change heatmap"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Show heatmap", exact: true }).click();
  await assertSameCamera();
  await page
    .getByRole("button", { name: "I made a pass · check again", exact: true })
    .click();
  observationCount++;
  await expect
    .poll(() => fixture.snapshot().observations.length)
    .toBe(observationCount);
  const checkedAgain = fixture.snapshot().observations.at(-1)!.measurement!;
  expect(checkedAgain.reportedPass).toBe(true);
  expect(checkedAgain.verdict).toBe("build");
  expect(checkedAgain.progress).toBeCloseTo(measuredLight.progress!, 1);
  await assertSameCamera();
  await page.screenshot({
    path: testInfo.outputPath("synthetic-light-checkpoint.png"),
    fullPage: true,
  });
  await close();
  await expect(page.locator(".baseline-status")).toContainText(
    "Baseline captured",
  );
  await assertSameCamera();

  await setFrame(page, full.output.url);
  const measuredFull = await check();
  expect(measuredFull.verdict).toBe("at_target");
  expect(Math.abs(measuredFull.progress! - 1)).toBeLessThanOrEqual(0.15);
  expect(fixture.snapshot().completedActionIds).toEqual([]);
  await close();

  await setFrame(page, full.output.url, { uneven: true });
  const relit = await check();
  expect(relit.verdict).toBe("insufficient");
  expect(relit.progress).toBeNull();
  expect(relit.reason).toMatch(/light changed/i);
  await expect(progress).toHaveCount(0);
  await close();

  await setFrame(page, full.output.url, { rotate: 22 });
  const turned = await check();
  expect(turned.verdict).toBe("insufficient");
  expect(turned.progress).toBeNull();
  expect(turned.reason).toMatch(/angle changed|whole face visible/i);
  await close();

  await setFrame(page, full.output.url);
  const recovered = await check();
  expect(recovered.verdict).toBe("at_target");
  expect(Math.abs(recovered.progress! - 1)).toBeLessThanOrEqual(0.15);
  const measurements = [
    measuredLight,
    checkedAgain,
    measuredFull,
    relit,
    turned,
    recovered,
  ];
  const timingPath = testInfo.outputPath("synthetic-camera-measurements.json");
  await writeFile(
    timingPath,
    JSON.stringify(
      {
        evidenceClass: "synthetic_canvas_camera_engineering_test",
        frame: { width: 1024, height: 1280, framesPerSecond: 12 },
        browser: page.context().browser()?.version(),
        timingScope:
          "Warmed capture, exact IMAGE inference, PNG encoding and pixel calculation; excludes model startup, JPEG encoding, persistence and UI rendering. No physical webcam or participant.",
        measurements,
      },
      null,
      2,
    ),
  );
  await testInfo.attach("synthetic-camera-measurements", {
    path: timingPath,
    contentType: "application/json",
  });
  for (const command of fixture.commands) {
    expect(JSON.stringify(command)).not.toMatch(
      /data:image|landmarks|checkpointUrl|"pixels"|"heatmap"/,
    );
    if (command.type === "checkpoint") expect(command.assetId).toBeUndefined();
  }
  expect(fixture.blockedRequests).toEqual([]);
  expect(
    fixture.snapshot().assets.every((asset) => asset.purpose !== "checkpoint"),
  ).toBe(true);
  expect(errors).toEqual([]);
  await close();
  await page
    .getByRole("button", { name: "Pause", exact: true })
    .first()
    .click();
  await expect(page.locator(".face-guide")).toHaveCount(0);
});
