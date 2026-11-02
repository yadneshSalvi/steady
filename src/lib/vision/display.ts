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

export const DEFAULT_HEATMAP_SHADE = "#BE6680";

const clampedProgress = (progress: number) =>
  Math.max(0, Math.min(1.5, progress));

function mixColor(from: string, to: string, fraction: number): string {
  const channel = (color: string, index: number) =>
    parseInt(color.slice(index * 2 + 1, index * 2 + 3), 16);
  return `#${[0, 1, 2]
    .map((index) =>
      Math.round(
        channel(from, index) * (1 - fraction) + channel(to, index) * fraction,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Warm tints of the chosen cosmetic shade, then a deeper plum/brown. */
export function heatmapColors(shade = DEFAULT_HEATMAP_SHADE): string[] {
  return [
    mixColor(shade, "#FFF1E8", 0.78),
    mixColor(shade, "#FFF1E8", 0.3),
    shade,
    mixColor(shade, "#39201E", 0.55),
  ];
}

/** A continuous display scale; measurement values are never changed here. */
export function heatmapColor(
  progress: number,
  shade = DEFAULT_HEATMAP_SHADE,
): string {
  const colors = heatmapColors(shade);
  const position = clampedProgress(progress) * 2;
  const lower = Math.min(2, Math.floor(position));
  const color = mixColor(colors[lower], colors[lower + 1], position - lower);
  return `rgb(${[1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(" ")})`;
}

/** Low progress leaves skin visible; mirrors retain their stronger target alpha. */
export function heatmapOpacity(progress: number, full = false): number {
  const value = clampedProgress(progress);
  const target = full ? 0.62 : 0.45;
  return value <= 1
    ? 0.13 + (target - 0.13) * value
    : target + (value - 1) * 0.1;
}

/** The same color and alpha stops as the face, over a warm skin backing. */
export function heatmapGradient(
  shade = DEFAULT_HEATMAP_SHADE,
  full = false,
): string {
  const stops = [0, 0.5, 1, 1.5].map(
    (progress) =>
      `${heatmapColor(progress, shade).replace(
        ")",
        ` / ${heatmapOpacity(progress, full)})`,
      )} ${(progress / 1.5) * 100}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")}), #C9977E`;
}

/** One display window around every region a method paints (e.g. both cheeks). */
export function unionCrop(boxes: readonly (CropBox | null)[]): CropBox | null {
  const present = boxes.filter((box): box is CropBox => !!box);
  if (!present.length) return null;
  const x = Math.min(...present.map((box) => box.x));
  const y = Math.min(...present.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...present.map((box) => box.x + box.width)) - x,
    height: Math.max(...present.map((box) => box.y + box.height)) - y,
  };
}

export interface DisplayHeatCell {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  progress: number;
}

/**
 * Display-only upsampling of the measured 4×4 grid (cell ids "row:column"
 * over the region bounds). Each finer tile is drawn inside a measured cell and
 * coloured by bilinear interpolation between measured cell centres, plus one
 * edge ring so a blur keeps colour up to the region mask. Measurement values
 * are never recomputed or stored here.
 */
export function smoothHeatmap(
  cells: readonly { id: string; progress: number }[],
  box: CropBox,
  source = 4,
  display = 8,
): DisplayHeatCell[] {
  const values = new Map(cells.map((cell) => [cell.id, cell.progress]));
  const index = (value: number) => Math.max(0, Math.min(source - 1, value));
  const at = (row: number, column: number) =>
    values.get(`${index(row)}:${index(column)}`);
  const scale = display / source;
  const tiles: DisplayHeatCell[] = [];
  for (let row = -1; row <= display; row++) {
    for (let column = -1; column <= display; column++) {
      if (at(Math.floor(row / scale), Math.floor(column / scale)) === undefined)
        continue;
      const gy = (row + 0.5) / scale - 0.5;
      const gx = (column + 0.5) / scale - 0.5;
      const r0 = Math.floor(gy),
        c0 = Math.floor(gx);
      let sum = 0,
        weight = 0;
      for (const [r, wr] of [
        [r0, 1 - (gy - r0)],
        [r0 + 1, gy - r0],
      ]) {
        for (const [c, wc] of [
          [c0, 1 - (gx - c0)],
          [c0 + 1, gx - c0],
        ]) {
          const value = at(r, c);
          if (value === undefined || wr * wc <= 0) continue;
          sum += value * wr * wc;
          weight += wr * wc;
        }
      }
      if (!weight) continue;
      tiles.push({
        id: `${row}:${column}`,
        x: box.x + (column * box.width) / display,
        y: box.y + (row * box.height) / display,
        width: box.width / display,
        height: box.height / display,
        progress: sum / weight,
      });
    }
  }
  return tiles;
}
