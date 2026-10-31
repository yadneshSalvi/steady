/// <reference lib="webworker" />
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { faceEligible } from "./geometry";

// IMAGE inference has its own instance: switching a VIDEO tracker between modes
// invalidates its temporal state and can associate a still with an older frame.
let origin: string | null = null;
let files: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
let video: Promise<FaceLandmarker> | null = null;
let image: Promise<FaceLandmarker> | null = null;

function detector(mode: "IMAGE" | "VIDEO"): Promise<FaceLandmarker> {
  if (!origin) return Promise.reject(new Error("Tracker is not initialized"));
  const existing = mode === "IMAGE" ? image : video;
  if (existing) return existing;
  files ??= FilesetResolver.forVisionTasks(`${origin}/vision`);
  const initializing = files.then((resolved) =>
    FaceLandmarker.createFromOptions(resolved, {
      baseOptions: {
        modelAssetPath: `${origin}/models/face_landmarker.task`,
        delegate: "CPU",
      },
      runningMode: mode,
      numFaces: 1,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    }),
  );
  if (mode === "IMAGE") image = initializing;
  else video = initializing;
  return initializing;
}

self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      origin = message.origin;
      await detector(message.mode === "IMAGE" ? "IMAGE" : "VIDEO");
      self.postMessage({ type: "ready" });
    } catch {
      self.postMessage({ type: "error" });
    }
    return;
  }
  if (message.type === "frame") {
    const bitmap: ImageBitmap = message.bitmap;
    try {
      const landmarker = await detector("VIDEO");
      const start = performance.now();
      const result = landmarker.detectForVideo(bitmap, message.timestamp);
      const points = result.faceLandmarks[0] || [];
      self.postMessage({
        type: "result",
        points: faceEligible(points) ? points : [],
        timestamp: message.timestamp,
        frameMs: performance.now() - start,
      });
    } catch {
      self.postMessage({
        type: "result",
        points: [],
        timestamp: message.timestamp,
      });
    } finally {
      bitmap.close();
    }
    return;
  }
  if (message.type === "image") {
    const bitmap: ImageBitmap = message.bitmap;
    const start = performance.now();
    try {
      const landmarker = await detector("IMAGE");
      const result = landmarker.detect(bitmap);
      const points = result.faceLandmarks[0] || [];
      self.postMessage({
        type: "image-result",
        requestId: message.requestId,
        points,
        eligible: faceEligible(points),
        frameMs: performance.now() - start,
      });
    } catch {
      self.postMessage({
        type: "image-result",
        requestId: message.requestId,
        points: [],
        eligible: false,
        frameMs: performance.now() - start,
      });
    } finally {
      bitmap.close();
    }
  }
};
