import type { BrushStroke } from "@/core/document";

/** Dab center with its radius and alpha: x, y, radius, alpha. */
export type Dab = readonly [number, number, number, number];

/** Dabs every quarter diameter along the stroke, starting at its first point; a fixed walk keeps replays identical. */
export function strokeDabs(stroke: BrushStroke): Dab[] {
  const radius = stroke.size / 2;
  const spacing = Math.max(1, stroke.size / 4);
  const dabs: Dab[] = [];
  const [first] = stroke.points;
  if (!first) {
    return dabs;
  }
  const dab = (x: number, y: number, pressure: number): Dab => [
    x,
    y,
    radius,
    stroke.flow * pressure,
  ];
  dabs.push(dab(first[0], first[1], first[2]));
  let travelled = 0;
  let next = spacing;
  for (let i = 1; i < stroke.points.length; i++) {
    const [ax, ay, ap] = stroke.points[i - 1];
    const [bx, by, bp] = stroke.points[i];
    const length = Math.hypot(bx - ax, by - ay);
    while (length > 0 && next <= travelled + length) {
      const t = (next - travelled) / length;
      dabs.push(
        dab(ax + (bx - ax) * t, ay + (by - ay) * t, ap + (bp - ap) * t),
      );
      next += spacing;
    }
    travelled += length;
  }
  return dabs;
}
