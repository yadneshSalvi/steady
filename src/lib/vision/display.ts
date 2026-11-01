export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Expand the crop to the viewport ratio; never trim the measured region. */
export function containedRegionViewBox(
  crop: CropBox | null,
  image: { width: number; height: number },
  viewport: { width: number; height: number },
): CropBox {
  const box = crop
    ? {
        x: crop.x * image.width,
        y: crop.y * image.height,
        width: crop.width * image.width,
        height: crop.height * image.height,
      }
    : { x: 0, y: 0, ...image };
  const ratio =
    viewport.width > 0 && viewport.height > 0
      ? viewport.width / viewport.height
      : box.width / box.height;
  const width = Math.max(box.width, box.height * ratio);
  const height = Math.max(box.height, box.width / ratio);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return {
    x:
      width <= image.width
        ? Math.max(0, Math.min(image.width - width, center.x - width / 2))
        : center.x - width / 2,
    y:
      height <= image.height
        ? Math.max(0, Math.min(image.height - height, center.y - height / 2))
        : center.y - height / 2,
    width,
    height,
  };
}

export const HEATMAP_COLORS = ["#729CB4", "#E8C37A", "#B9675D", "#8A567D"];

/** A continuous display scale; measurement values are never changed here. */
export function heatmapColor(progress: number): string {
  const position = Math.max(0, Math.min(1.5, progress)) * 2;
  const lower = Math.min(2, Math.floor(position));
  const fraction = position - lower;
  const channel = (color: string, index: number) =>
    parseInt(color.slice(index * 2 + 1, index * 2 + 3), 16);
  return `rgb(${[0, 1, 2]
    .map((index) =>
      Math.round(
        channel(HEATMAP_COLORS[lower], index) * (1 - fraction) +
          channel(HEATMAP_COLORS[lower + 1], index) * fraction,
      ),
    )
    .join(" ")})`;
}
