"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { containedRegionViewBox, type CropBox } from "@/lib/vision/display";

function useViewport<T extends Element>() {
  const ref = useRef<T>(null);
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
  return [ref, viewport] as const;
}

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
  const [ref, viewport] = useViewport<SVGSVGElement>();
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

/**
 * The same region crop as RegionImage, drawn with an optimized <img>. The
 * source pixels are untouched; only the visible window changes. `crop`
 * undefined means the face guide is still loading; null shows the whole image.
 */
export function RegionPhoto({
  src,
  width,
  height,
  crop,
  alt,
  unoptimized = false,
  className = "",
}: {
  src: string;
  width: number;
  height: number;
  crop: CropBox | null | undefined;
  alt: string;
  unoptimized?: boolean;
  className?: string;
}) {
  const [ref, viewport] = useViewport<HTMLDivElement>();
  const measured = viewport.width > 0 && viewport.height > 0;
  const box = crop
    ? containedRegionViewBox(crop, { width, height }, viewport)
    : null;
  const style: CSSProperties | undefined = box
    ? {
        position: "absolute",
        maxWidth: "none",
        width: `${(width / box.width) * 100}%`,
        height: `${(height / box.height) * 100}%`,
        left: `${(-box.x / box.width) * 100}%`,
        top: `${(-box.y / box.height) * 100}%`,
        objectFit: "fill",
      }
    : undefined;
  // Ask for enough pixels for the zoomed window, not just the frame.
  const rendered = box
    ? Math.ceil((viewport.width * width) / box.width)
    : Math.ceil(viewport.width);
  return (
    <div
      ref={ref}
      className={`region-photo ${crop === undefined ? "is-loading" : ""} ${className}`}
    >
      {measured && crop !== undefined ? (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={`${Math.min(2048, Math.max(64, rendered))}px`}
          unoptimized={unoptimized}
          style={style}
        />
      ) : null}
    </div>
  );
}
