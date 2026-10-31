import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectStillImage,
  disposeStillImageDetector,
} from "@/lib/vision/still-detector";

class FakeWorker {
  static instances: FakeWorker[] = [];
  sent: { message: Record<string, unknown>; transfer?: Transferable[] }[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: Record<string, unknown>, transfer?: Transferable[]) {
    this.sent.push({ message, transfer });
    if (message.type === "init") this.respond({ type: "ready" });
  }
  respond(data: Record<string, unknown>) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("location", { origin: "http://localhost:3000" });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close: vi.fn() })),
  );
});
afterEach(() => {
  disposeStillImageDetector();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("exact still detector browser lifecycle", () => {
  it("snapshots without resizing and transfers that exact bitmap to IMAGE detection", async () => {
    const source = { width: 1024, height: 1280 } as ImageData;
    const pending = detectStillImage(source);
    await settle();
    const worker = FakeWorker.instances[0];
    expect(worker.sent[0].message).toEqual({
      type: "init",
      mode: "IMAGE",
      origin: "http://localhost:3000",
    });
    expect(createImageBitmap).toHaveBeenCalledWith(source);
    const bitmap = await vi.mocked(createImageBitmap).mock.results[0].value;
    const request = worker.sent[1];
    expect(request.message.bitmap).toBe(bitmap);
    expect(request.transfer).toEqual([bitmap]);
    worker.respond({
      type: "image-result",
      requestId: request.message.requestId,
      points: [{ x: 0.2, y: 0.4 }],
      eligible: false,
      frameMs: 5,
    });
    expect(await pending).toEqual({
      points: [{ x: 0.2, y: 0.4 }],
      eligible: false,
      frameMs: 5,
    });
  });

  it("reuses its singleton while correlating concurrent responses by request ID", async () => {
    const first = detectStillImage({} as ImageData);
    const second = detectStillImage({} as ImageData);
    await settle();
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    const a = worker.sent[1].message,
      b = worker.sent[2].message;
    expect(a.requestId).not.toBe(b.requestId);
    worker.respond({
      type: "image-result",
      requestId: b.requestId,
      points: [],
      eligible: true,
      frameMs: 9,
    });
    worker.respond({
      type: "image-result",
      requestId: a.requestId,
      points: [],
      eligible: false,
      frameMs: 4,
    });
    expect((await first).frameMs).toBe(4);
    expect((await second).frameMs).toBe(9);
  });

  it("bounds a lost inference and starts a fresh worker on retry", async () => {
    vi.useFakeTimers();
    const pending = detectStillImage({} as ImageData, { timeoutMs: 100 });
    const failed = expect(pending).rejects.toThrow("in time");
    await settle();
    const original = FakeWorker.instances[0];
    await vi.advanceTimersByTimeAsync(100);
    await failed;
    expect(original.terminate).toHaveBeenCalledOnce();
    const retry = detectStillImage({} as ImageData);
    await settle();
    expect(FakeWorker.instances).toHaveLength(2);
    const worker = FakeWorker.instances[1];
    worker.respond({
      type: "image-result",
      requestId: worker.sent[1].message.requestId,
      points: [],
      eligible: false,
      frameMs: 1,
    });
    await retry;
  });

  it("releases all pending requests after a worker failure", async () => {
    const a = detectStillImage({} as ImageData),
      b = detectStillImage({} as ImageData);
    const failedA = expect(a).rejects.toThrow("stopped"),
      failedB = expect(b).rejects.toThrow("stopped");
    await settle();
    FakeWorker.instances[0].onerror?.();
    await Promise.all([failedA, failedB]);
  });

  it("closes an untransferred bitmap when startup fails", async () => {
    class BrokenWorker extends FakeWorker {
      postMessage() {
        throw new Error("blocked");
      }
    }
    vi.stubGlobal("Worker", BrokenWorker);
    await expect(detectStillImage({} as ImageData)).rejects.toThrow(
      "could not start",
    );
    const bitmap = await vi.mocked(createImageBitmap).mock.results[0].value;
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("bounds a model startup that never returns ready", async () => {
    vi.useFakeTimers();
    class SilentWorker extends FakeWorker {
      postMessage(message: Record<string, unknown>, transfer?: Transferable[]) {
        this.sent.push({ message, transfer });
      }
    }
    vi.stubGlobal("Worker", SilentWorker);
    const pending = detectStillImage({} as ImageData);
    const failed = expect(pending).rejects.toThrow("too long to load");
    await settle();
    await vi.advanceTimersByTimeAsync(30_000);
    await failed;
    const bitmap = await vi.mocked(createImageBitmap).mock.results[0].value;
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
});
