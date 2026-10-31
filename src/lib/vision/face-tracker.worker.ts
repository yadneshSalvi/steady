/// <reference lib="webworker" />
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { faceEligible } from "./geometry";
let landmarker: FaceLandmarker | null = null;
self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      const files = await FilesetResolver.forVisionTasks(
        `${message.origin}/vision`,
      );
      landmarker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${message.origin}/models/face_landmarker.task`,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      self.postMessage({ type: "ready" });
    } catch {
      self.postMessage({ type: "error" });
    }
  }
  if (message.type === "frame") {
    const bitmap: ImageBitmap = message.bitmap;
    try {
      if (!landmarker) {
        self.postMessage({
          type: "result",
          points: [],
          timestamp: message.timestamp,
        });
        return;
      }
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
  }
};
