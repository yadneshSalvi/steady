import sourceLandmarks from "../fixtures/sample-landmarks.json";
type PixelPoint = { x: number; y: number };
// Independently fixed below-eye pixels, outside the upper-lid measurement mask.
export function belowEyePatch(region: "left_eye" | "right_eye"): PixelPoint[] {
  const { width, height } = sourceLandmarks.source;
  const [outer, inner, lower, lower2] = (
    region === "left_eye" ? [263, 362, 374, 380] : [33, 133, 145, 153]
  ).map((index) => ({
    x: sourceLandmarks.points[index].x * width,
    y: sourceLandmarks.points[index].y * height,
  }));
  const dx = inner.x - outer.x,
    dy = inner.y - outer.y;
  const eyeWidth = Math.hypot(dx, dy);
  const across = { x: dx / eyeWidth, y: dy / eyeWidth };
  const downSign = across.x < 0 ? -1 : 1;
  const down = { x: -across.y * downSign, y: across.x * downSign };
  const center = { x: (outer.x + inner.x) / 2, y: (lower.y + lower2.y) / 2 };
  return [
    [-0.38, 0.07],
    [0.38, 0.07],
    [0.38, 0.23],
    [-0.38, 0.23],
  ].map(([horizontal, depth]) => ({
    x: center.x + eyeWidth * (across.x * horizontal + down.x * depth),
    y: center.y + eyeWidth * (across.y * horizontal + down.y * depth),
  }));
}
export function inside(point: PixelPoint, polygon: PixelPoint[]): boolean {
  let hit = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const a = polygon[index],
      b = polygon[previous];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
}
