"use client";
import { useEffect, useState } from "react";
import type { Region } from "@/lib/contracts";
import type { Point } from "@/lib/vision/geometry";
import { loadLocalFrame } from "@/lib/vision/local-checkpoints";
import { regionCrop } from "@/lib/vision/measure";
import { unionCrop, type CropBox } from "@/lib/vision/display";

/**
 * On-device face landmarks of the source photo, for display crops only.
 * undefined while loading; null when no face guide is available.
 */
export function useSourceLandmarks(url: string | undefined) {
  const [state, setState] = useState<{
    url: string;
    points: readonly Point[] | null;
  } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    // A slow device keeps the whole image rather than an empty frame.
    const timer = setTimeout(() => {
      if (alive)
        setState((current) =>
          current?.url === url ? current : { url, points: null },
        );
    }, 6000);
    void loadLocalFrame(url)
      .then((frame) => {
        if (alive)
          setState({
            url,
            points: frame.landmarks.length ? frame.landmarks : null,
          });
      })
      .catch(() => {
        if (alive) setState({ url, points: null });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url]);
  if (!url) return null;
  return state?.url === url ? state.points : undefined;
}

/** The display window for the regions a method paints. */
export function methodCrop(
  landmarks: readonly Point[] | null | undefined,
  regions: readonly Region[],
  padding = 0.28,
): CropBox | null | undefined {
  if (landmarks === undefined) return undefined;
  if (!landmarks) return null;
  return unionCrop(
    [...new Set(regions)].map((region) =>
      regionCrop(landmarks, region, padding),
    ),
  );
}
