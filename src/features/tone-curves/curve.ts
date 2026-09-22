import { z } from "zod";
import type { CurvePoint, ToneCurve } from "@/core/document";
import { clamp, interpolatePchip } from "@/lib/math";
import { unit } from "@/lib/parse";

export const defaultCurve: ToneCurve = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

const gap = 1 / 1024;

export const curveSchema = z
  .array(z.object({ x: unit, y: unit }))
  .min(2, "A curve needs at least two points")
  .refine(
    (points) =>
      points.every((point, i) => !i || point.x >= points[i - 1].x + gap),
    "Curve points must be ordered with a minimum x gap of 1/1024",
  )
  .refine((points) => {
    const first = points[0];
    const last = points[points.length - 1];
    return (first.x === 0 || first.y === 0) && (last.x === 1 || last.y === 1);
  }, "Curve endpoints must follow the lower-left and upper-right edges") satisfies z.ZodType<ToneCurve>;

export function moveCurvePoint(
  points: ToneCurve,
  index: number,
  point: CurvePoint,
): ToneCurve {
  if (!points[index]) {
    return points;
  }
  let x = clamp(point.x);
  let y = clamp(point.y);
  if (index === 0) {
    x = Math.min(x, points[1].x - gap);
    if (x < y) {
      x = 0;
    } else {
      y = 0;
    }
  } else if (index === points.length - 1) {
    x = Math.max(x, points[index - 1].x + gap);
    if (x > y) {
      x = 1;
    } else {
      y = 1;
    }
  } else {
    x = clamp(x, points[index - 1].x + gap, points[index + 1].x - gap);
  }
  return points.with(index, { x, y });
}

export function removeCurvePoint(points: ToneCurve, index: number): ToneCurve {
  if (index <= 0 || index >= points.length - 1) {
    return points;
  }
  return points.toSpliced(index, 1);
}

/** Uniform samples over 0..1, including both endpoints; size must be at least two. */
export function sampleCurve(points: ToneCurve, size = 1024) {
  const evaluate = interpolatePchip(points);
  return Float32Array.from({ length: size }, (_, i) =>
    evaluate(i / (size - 1)),
  );
}

function midpoint(points: ToneCurve): CurvePoint {
  let widest = 0;
  for (let i = 1; i < points.length - 1; i++) {
    if (
      points[i + 1].x - points[i].x >
      points[widest + 1].x - points[widest].x
    ) {
      widest = i;
    }
  }
  const x = (points[widest].x + points[widest + 1].x) / 2;
  return { x, y: interpolatePchip(points)(x) };
}

/** Without a position, insert on the curve in its widest interval. */
export function insertCurvePoint(points: ToneCurve, point = midpoint(points)) {
  const index = points.findIndex((next) => next.x > point.x);
  if (
    index <= 0 ||
    point.x - points[index - 1].x < gap ||
    points[index].x - point.x < gap
  ) {
    return null;
  }
  return { curve: points.toSpliced(index, 0, point), index };
}
