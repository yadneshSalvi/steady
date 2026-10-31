import type { Point } from "./geometry";

export interface StillDetection {
  points: Point[];
  eligible: boolean;
  frameMs: number;
}

interface PendingDetection {
  resolve: (result: StillDetection) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface StillWorker {
  worker: Worker;
  ready: Promise<void>;
  rejectReady: (error: Error) => void;
  startupTimer: ReturnType<typeof setTimeout>;
  pending: Map<number, PendingDetection>;
}

let active: StillWorker | null = null;
let nextRequestId = 0;

function fail(state: StillWorker, message: string) {
  if (active === state) active = null;
  clearTimeout(state.startupTimer);
  state.worker.terminate();
  const error = new Error(message);
  state.rejectReady(error);
  for (const pending of state.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  state.pending.clear();
}

function getStillWorker(): StillWorker {
  if (active) return active;
  if (typeof Worker === "undefined" || typeof location === "undefined") {
    throw new Error(
      "On-device still detection is unavailable in this browser.",
    );
  }
  const worker = new Worker(
    new URL("./face-tracker.worker.ts", import.meta.url),
    { type: "module" },
  );
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const state: StillWorker = {
    worker,
    ready,
    rejectReady,
    pending: new Map(),
    startupTimer: setTimeout(
      () => fail(state, "The on-device face model took too long to load."),
      30_000,
    ),
  };
  active = state;
  worker.onmessage = ({ data }: MessageEvent) => {
    if (data.type === "ready") {
      clearTimeout(state.startupTimer);
      resolveReady();
      return;
    }
    if (data.type === "error") {
      fail(state, "The on-device face model could not load. Try again.");
      return;
    }
    if (data.type !== "image-result") return;
    const pending = state.pending.get(data.requestId);
    if (!pending) return;
    state.pending.delete(data.requestId);
    clearTimeout(pending.timer);
    pending.resolve({
      points: data.points,
      eligible: data.eligible === true,
      frameMs: data.frameMs,
    });
  };
  worker.onerror = () =>
    fail(state, "On-device still detection stopped. Try capturing again.");
  worker.onmessageerror = () =>
    fail(state, "The captured frame could not be read. Try capturing again.");
  try {
    worker.postMessage({
      type: "init",
      mode: "IMAGE",
      origin: location.origin,
    });
  } catch {
    fail(state, "On-device still detection could not start.");
  }
  return state;
}

/**
 * Snapshot immediately, then run IMAGE detection on those exact pixels. The
 * singleton is independent from the mirror's VIDEO worker. No network upload is
 * performed; only the same-origin model/WASM assets are loaded by the worker.
 */
export async function detectStillImage(
  source: ImageBitmapSource,
  options: { timeoutMs?: number } = {},
): Promise<StillDetection> {
  if (typeof createImageBitmap === "undefined") {
    throw new Error("Still-image capture is unavailable in this browser.");
  }
  // Do not resize: caller landmarks must describe the pixels used for analysis.
  const bitmap = await createImageBitmap(source);
  let transferred = false;
  try {
    const state = getStillWorker();
    await state.ready;
    if (active !== state) throw new Error("Still detection was interrupted.");
    const requestId = ++nextRequestId;
    return await new Promise<StillDetection>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          fail(state, "The still could not be measured in time. Try again."),
        options.timeoutMs ?? 10_000,
      );
      state.pending.set(requestId, { resolve, reject, timer });
      try {
        state.worker.postMessage({ type: "image", requestId, bitmap }, [
          bitmap,
        ]);
        transferred = true;
      } catch {
        state.pending.delete(requestId);
        clearTimeout(timer);
        reject(
          new Error("The captured frame could not reach the face detector."),
        );
      }
    });
  } finally {
    if (!transferred) bitmap.close();
  }
}

/** Releases the model and rejects outstanding requests, for teardown/tests. */
export function disposeStillImageDetector() {
  if (active) fail(active, "Still detection was interrupted.");
}
