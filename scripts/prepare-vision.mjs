import { cp, mkdir } from "node:fs/promises";
await mkdir("public/vision", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/vision", {
  recursive: true,
});
console.log("Pinned MediaPipe 1.2.0 browser runtime prepared.");
