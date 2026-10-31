import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vision = vi.hoisted(() => ({
  detect: vi.fn(),
  detectForVideo: vi.fn(),
  create: vi.fn(),
  files: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vision.files },
  FaceLandmarker: { createFromOptions: vision.create },
}));

let scope: {
  onmessage: ((event: MessageEvent) => Promise<void>) | null;
  postMessage: ReturnType<typeof vi.fn>;
};
beforeEach(async () => {
  vi.resetModules();
  vision.detect.mockReset().mockReturnValue({ faceLandmarks: [] });
  vision.detectForVideo.mockReset().mockReturnValue({ faceLandmarks: [] });
  vision.files.mockReset().mockResolvedValue({});
  vision.create.mockReset().mockResolvedValue({
    detect: vision.detect,
    detectForVideo: vision.detectForVideo,
  });
  scope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal("self", scope);
  await import("@/lib/vision/face-tracker.worker");
});
afterEach(() => vi.unstubAllGlobals());

describe("Face Landmarker IMAGE/VIDEO protocol", () => {
  it("runs detect on the exact still bitmap and closes it", async () => {
    await scope.onmessage!({
      data: { type: "init", mode: "IMAGE", origin: "http://localhost" },
    } as MessageEvent);
    const bitmap = { close: vi.fn(), fixture: "captured pixels" };
    await scope.onmessage!({
      data: { type: "image", requestId: 9, bitmap },
    } as MessageEvent);
    expect(vision.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ runningMode: "IMAGE" }),
    );
    expect(vision.detect).toHaveBeenCalledWith(bitmap);
    expect(vision.detectForVideo).not.toHaveBeenCalled();
    expect(scope.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "image-result",
        requestId: 9,
        points: [],
        eligible: false,
      }),
    );
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("retains video timestamps and uses a separate IMAGE instance", async () => {
    await scope.onmessage!({
      data: { type: "init", origin: "http://localhost" },
    } as MessageEvent);
    const bitmap = { close: vi.fn() };
    await scope.onmessage!({
      data: { type: "frame", timestamp: 1345, bitmap },
    } as MessageEvent);
    expect(vision.detectForVideo).toHaveBeenCalledWith(bitmap, 1345);
    expect(scope.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "result", timestamp: 1345 }),
    );
    const still = { close: vi.fn() };
    await scope.onmessage!({
      data: { type: "image", requestId: "still-1", bitmap: still },
    } as MessageEvent);
    expect(vision.create.mock.calls.map((call) => call[1].runningMode)).toEqual(
      ["VIDEO", "IMAGE"],
    );
    expect(vision.detect).toHaveBeenCalledWith(still);
    expect(still.close).toHaveBeenCalledOnce();
  });

  it("returns an empty still result and closes failed inference input", async () => {
    await scope.onmessage!({
      data: { type: "init", mode: "IMAGE", origin: "http://localhost" },
    } as MessageEvent);
    vision.detect.mockImplementationOnce(() => {
      throw new Error("bad bitmap");
    });
    const bitmap = { close: vi.fn() };
    await scope.onmessage!({
      data: { type: "image", requestId: 3, bitmap },
    } as MessageEvent);
    expect(scope.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "image-result",
        requestId: 3,
        points: [],
        eligible: false,
      }),
    );
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
