"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Region } from "@/lib/contracts";
import { projectPoint, regionPolygon, type Point } from "@/lib/vision/geometry";

export function FaceGuide({
  videoRef,
  enabled,
  region,
  mirrored,
  onTracking,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  region: Region;
  mirrored: boolean;
  onTracking?: (points: readonly Point[]) => void;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const [state, setState] = useState<
    "loading" | "tracking" | "no_face" | "unavailable"
  >("loading");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const previous = useRef<Point[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false,
      busy = false,
      ready = false,
      lastSent = 0,
      lastVideoTime = -1,
      lastResult = 0,
      raf = 0;
    let worker: Worker;
    const video = videoRef.current;
    if (!video || !window.Worker || !window.createImageBitmap) {
      queueMicrotask(() => setState("unavailable"));
      return;
    }
    const resize = new ResizeObserver(() => {
      const rect = video.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    resize.observe(video);
    try {
      worker = new Worker(
        new URL("../lib/vision/face-tracker.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      queueMicrotask(() => setState("unavailable"));
      resize.disconnect();
      return;
    }
    worker.onmessage = (event) => {
      if (stopped) return;
      if (event.data.type === "ready") {
        ready = true;
        setState("no_face");
      }
      if (event.data.type === "error") {
        setState("unavailable");
        ready = false;
      }
      if (event.data.type === "result") {
        busy = false;
        lastResult = performance.now();
        setSourceSize((old) =>
          old.width === video.videoWidth && old.height === video.videoHeight
            ? old
            : { width: video.videoWidth, height: video.videoHeight },
        );
        if (lastResult - event.data.timestamp > 600) {
          previous.current = [];
          setPoints([]);
          setState("no_face");
          return;
        }
        const next: Point[] = event.data.points;
        onTracking?.(next);
        if (!next.length) {
          previous.current = [];
          setPoints([]);
          setState("no_face");
          return;
        }
        // Dampen small camera jitter; reset on a large movement instead of trailing stale guides.
        const old = previous.current;
        const jump =
          old.length &&
          Math.hypot(next[1].x - old[1].x, next[1].y - old[1].y) > 0.07;
        const smooth =
          old.length === next.length && !jump
            ? next.map((p, i) => ({
                x: old[i].x * 0.35 + p.x * 0.65,
                y: old[i].y * 0.35 + p.y * 0.65,
              }))
            : next;
        previous.current = smooth;
        setPoints(smooth);
        setState("tracking");
      }
    };
    worker.onerror = () => {
      if (!stopped) {
        ready = false;
        busy = false;
        setState("unavailable");
        setPoints([]);
      }
    };
    worker.postMessage({ type: "init", origin: location.origin });
    const loop = async (now: number) => {
      if (stopped) return;
      if (lastResult && now - lastResult > 750 && previous.current.length) {
        previous.current = [];
        setPoints([]);
        setState("no_face");
      }
      if (
        ready &&
        !busy &&
        now - lastSent > 90 &&
        video.readyState >= 2 &&
        video.videoWidth &&
        video.currentTime !== lastVideoTime
      ) {
        busy = true;
        lastSent = now;
        lastVideoTime = video.currentTime;
        try {
          const bitmap = await createImageBitmap(video, {
            resizeWidth: 480,
            resizeHeight: Math.round(
              (480 * video.videoHeight) / video.videoWidth,
            ),
          });
          if (stopped) {
            bitmap.close();
            return;
          }
          worker.postMessage({ type: "frame", bitmap, timestamp: now }, [
            bitmap,
          ]);
        } catch {
          busy = false;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      worker.terminate();
      previous.current = [];
    };
  }, [enabled, videoRef, onTracking]);
  if (!enabled) return null;
  const projected =
    points.length && sourceSize.width
      ? regionPolygon(points, region).map((point) =>
          projectPoint(point, sourceSize, size, mirrored),
        )
      : [];
  const label =
    state === "loading"
      ? "Preparing on-device guide…"
      : state === "unavailable"
        ? "Guide unavailable · text guidance still works"
        : state === "no_face"
          ? "Face the camera for a placement guide"
          : "Placement guide · processed on this device";
  return (
    <div
      className="face-guide"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size.width} ${size.height}`}
        aria-hidden="true"
      >
        {projected.length > 0 && state === "tracking" && (
          <polygon
            points={projected.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(245,200,92,.15)"
            stroke="#fff9e7"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeDasharray="7 5"
            style={{ filter: "drop-shadow(0 1px 2px rgba(17,24,20,.75))" }}
          />
        )}
      </svg>
      <span
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 16,
          padding: "9px 12px",
          borderRadius: 8,
          background: "rgba(17,24,20,.78)",
          color: "#fffaf1",
          fontSize: 14,
          textAlign: "center",
        }}
      >
        {label}
      </span>
    </div>
  );
}
export default FaceGuide;
