"use client";
import { useEffect, useRef, useState } from "react";
import type { Region } from "@/lib/contracts";
import {
  projectPoint,
  REGION_LANDMARKS,
  type Point,
} from "@/lib/vision/geometry";

export function StaticFaceGuide({
  points,
  region,
  width,
  height,
}: {
  points: readonly Point[];
  region: Region;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const polygon = REGION_LANDMARKS[region].map((index) =>
    projectPoint(points[index], { width, height }, size, false),
  );
  return (
    <div
      ref={ref}
      className="static-face-guide"
      aria-label="On-device sample placement guide"
    >
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        width="100%"
        height="100%"
        aria-hidden
      >
        <polygon
          points={polygon.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="rgba(245,200,92,.15)"
          stroke="#fff9e7"
          strokeWidth="2.5"
          strokeDasharray="7 5"
          strokeLinejoin="round"
        />
      </svg>
      <span>Placement guide</span>
    </div>
  );
}
