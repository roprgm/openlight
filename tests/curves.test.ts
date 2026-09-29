import { expect, test } from "bun:test";
import {
  defaultCurve,
  insertCurvePoint,
  moveCurvePoint,
  removeCurvePoint,
  sampleCurve,
} from "@/features/tone-curves/curve";
import { interpolatePchip } from "@/lib/math";

test("curves interpolate smoothly through their handles without overshoot", () => {
  expect(sampleCurve(defaultCurve, 5)).toEqual(
    new Float32Array([0, 0.25, 0.5, 0.75, 1]),
  );
  const lift = interpolatePchip([
    { x: 0, y: 0 },
    { x: 0.5, y: 0.75 },
    { x: 1, y: 1 },
  ]);
  expect(lift(0.25)).toBeCloseTo(0.453125, 7);
  expect(lift(0.5)).toBe(0.75);
  expect(lift(0.75)).toBeCloseTo(0.921875, 7);
  expect([lift(-1), lift(2)]).toEqual([0, 1]);
  const h = 1e-5;
  expect((lift(0.5) - lift(0.5 - h)) / h).toBeCloseTo(
    (lift(0.5 + h) - lift(0.5)) / h,
    3,
  );
  const points = [
    { x: 0, y: 0 },
    { x: 0.02, y: 0.4 },
    { x: 0.3, y: 0.4 },
    { x: 0.7, y: 0.2 },
    { x: 0.99, y: 0.95 },
    { x: 1, y: 1 },
  ];
  const evaluate = interpolatePchip(points);
  // Between two handles the curve stays within their values and moves one way.
  for (const [i, start] of points.slice(0, -1).entries()) {
    const end = points[i + 1];
    let previous = evaluate(start.x);
    expect(previous).toBeCloseTo(start.y, 10);
    for (let step = 1; step <= 20; step++) {
      const value = evaluate(start.x + ((end.x - start.x) * step) / 20);
      expect(value).toBeGreaterThanOrEqual(Math.min(start.y, end.y) - 1e-12);
      expect(value).toBeLessThanOrEqual(Math.max(start.y, end.y) + 1e-12);
      expect(
        (value - previous) * Math.sign(end.y - start.y),
      ).toBeGreaterThanOrEqual(-1e-12);
      previous = value;
    }
  }
});

test("curve point edits keep endpoints on their edges and points apart", () => {
  const gap = 1 / 1024;
  const curve = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 1 },
  ];
  const move = (index: number, x: number, y: number) =>
    Object.values(moveCurvePoint(curve, index, { x, y })[index]);
  // An endpoint follows whichever edge of the graph the drag stays nearer.
  expect(move(0, 0.3, 0.1)).toEqual([0.3, 0]);
  expect(move(0, 0.1, 0.3)).toEqual([0, 0.3]);
  expect(move(2, 0.9, 0.7)).toEqual([1, 0.7]);
  expect(move(2, 0.7, 0.9)).toEqual([0.7, 1]);
  expect(move(0, 0.9, 0)).toEqual([0.5 - gap, 0]);
  expect(move(1, 2, 0.5)).toEqual([1 - gap, 0.5]);

  expect(removeCurvePoint(curve, 0)).toBe(curve);
  expect(removeCurvePoint(curve, 2)).toBe(curve);
  expect(removeCurvePoint(curve, 1)).toEqual(defaultCurve);

  expect(insertCurvePoint(defaultCurve)).toEqual({ curve, index: 1 });
  expect(insertCurvePoint(curve, { x: 0.5 + gap / 2, y: 0.6 })).toBeNull();
  expect(insertCurvePoint(curve, { x: 0.75, y: 0.9 })).toEqual({
    curve: [...curve.slice(0, 2), { x: 0.75, y: 0.9 }, curve[2]],
    index: 2,
  });
});
