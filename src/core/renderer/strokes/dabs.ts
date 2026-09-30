import type { BrushStroke } from "@/core/document";

/** Dab center with its radius and alpha: x, y, radius, alpha. */
export type Dab = readonly [number, number, number, number];

/** Where a walk along a stroke stopped: the points it passed, the distance it covered, and where the next dab lands. */
export type DabWalk = {
  readonly points: number;
  readonly travelled: number;
  readonly next: number;
};

/**
 * Dabs sixteen times per diameter along the stroke, starting at its first point, close enough that soft
 * edges add up without ripples; a fixed walk keeps replays identical. Each dab lays less, so a stroke
 * builds up as it does with four, Photoshop's spacing. A walk goes on `from` where an earlier one
 * stopped on the same first points, so a growing stroke walks each point once.
 */
export function walkDabs(
  stroke: BrushStroke,
  from?: DabWalk,
): { dabs: Dab[]; walk: DabWalk } {
  const radius = stroke.size / 2;
  const spacing = Math.max(1, stroke.size / 16);
  const share = spacing / Math.max(1, stroke.size / 4);
  const dabs: Dab[] = [];
  const dab = (x: number, y: number, pressure: number): Dab => [
    x,
    y,
    radius,
    1 - (1 - stroke.flow * pressure) ** share,
  ];
  const [first] = stroke.points;
  const resumed = from?.points ? from : undefined;
  if (first && !resumed) {
    dabs.push(dab(first[0], first[1], first[2]));
  }
  let travelled = resumed?.travelled ?? 0;
  let next = resumed?.next ?? spacing;
  for (let i = resumed?.points ?? 1; i < stroke.points.length; i++) {
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
  return { dabs, walk: { points: stroke.points.length, travelled, next } };
}
