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
