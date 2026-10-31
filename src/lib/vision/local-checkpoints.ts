"use client";
import type { Point } from "./geometry";
import type { StoredMeasurement } from "../contracts";
import type { MeasurementFrame, MeasurementResult } from "./measure";
import { detectStillImage } from "./still-detector";

export interface LocalFrame extends MeasurementFrame {
  canvas: HTMLCanvasElement;
}
export interface LocalCheckpoint {
  actionId: string;
  checkpointUrl: string;
  targetUrl: string;
  result: MeasurementResult;
  measurement: StoredMeasurement;
  landmarks: readonly Point[];
  targetLandmarks: readonly Point[];
  isSample: boolean;
  elapsedMs: number;
  width: number;
  height: number;
}
const sources = new Map<string, Promise<LocalFrame>>();
const checkpoints = new Map<string, LocalCheckpoint>();
const baselines = new Map<string, LocalFrame>();
export const checkpointKey = (sessionId: string, actionId: string) =>
  `${sessionId}:${actionId}`;
export function rememberCheckpoint(
  sessionId: string,
  checkpoint: LocalCheckpoint,
) {
  checkpoints.set(checkpointKey(sessionId, checkpoint.actionId), checkpoint);
  if (checkpoints.size > 24)
    checkpoints.delete(checkpoints.keys().next().value!);
}
export function readLocalCheckpoint(sessionId: string, actionId: string) {
  return checkpoints.get(checkpointKey(sessionId, actionId));
}
export function readLocalBaseline(sessionId: string, actionId: string) {
  return baselines.get(checkpointKey(sessionId, actionId));
}
export function rememberBaseline(
  sessionId: string,
  actionId: string,
  frame: LocalFrame,
) {
  baselines.set(checkpointKey(sessionId, actionId), frame);
  if (baselines.size > 12) baselines.delete(baselines.keys().next().value!);
}
export function forgetBaseline(sessionId: string, actionId: string) {
  baselines.delete(checkpointKey(sessionId, actionId));
}

export function canvasFrom(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("This browser could not read a local checkpoint.");
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}
export async function frameFromCanvas(
  canvas: HTMLCanvasElement,
  knownPoints?: readonly Point[],
): Promise<LocalFrame> {
  const detection = knownPoints
    ? { points: knownPoints, eligible: true }
    : await detectStillImage(canvas);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  return {
    canvas,
    image: context.getImageData(0, 0, canvas.width, canvas.height),
    landmarks: detection.points,
    eligible: detection.eligible,
  };
}
export async function loadLocalFrame(
  url: string,
  knownPoints?: readonly Point[],
): Promise<LocalFrame> {
  if (!knownPoints && sources.has(url)) return sources.get(url)!;
  const pending = (async () => {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok)
      throw new Error("Your source or target photo could not be opened.");
    const bitmap = await createImageBitmap(await response.blob());
    try {
      return await frameFromCanvas(
        canvasFrom(bitmap, bitmap.width, bitmap.height),
        knownPoints,
      );
    } finally {
      bitmap.close();
    }
  })();
  if (!knownPoints) {
    sources.set(url, pending);
    void pending.catch(() => sources.delete(url));
    if (sources.size > 8) sources.delete(sources.keys().next().value!);
  }
  return pending;
}
export async function captureLocalFrame(
  video: HTMLVideoElement,
): Promise<LocalFrame> {
  if (video.readyState < 2 || !video.videoWidth)
    throw new Error("Wait for a clear camera image before checking.");
  return frameFromCanvas(
    canvasFrom(video, video.videoWidth, video.videoHeight),
  );
}
export async function fileFromFrame(frame: LocalFrame): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) =>
    frame.canvas.toBlob(resolve, "image/jpeg", 0.96),
  );
  if (!blob) throw new Error("The local checkpoint could not be prepared.");
  return new File([blob], "steady-selected-checkpoint.jpg", {
    type: "image/jpeg",
  });
}
