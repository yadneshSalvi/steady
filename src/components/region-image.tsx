"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { containedRegionViewBox, type CropBox } from "@/lib/vision/display";

export function RegionImage({
  src,
  width,
  height,
  crop,
  label,
  children,
}: {
  src: string;
  width: number;
  height: number;
  crop: CropBox | null;
  label: string;
  children?: ReactNode;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const box = containedRegionViewBox(crop, { width, height }, viewport);
  return (
    <svg
      ref={ref}
      preserveAspectRatio="xMidYMid meet"
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      role="img"
      aria-label={label}
    >
      <image href={src} width={width} height={height} />
      {children}
    </svg>
  );
}
