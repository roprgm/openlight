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
  const identity = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
  const samples = sampleCurve(identity, 257);
  expect(samples).toBeInstanceOf(Float32Array);
  for (let i = 0; i < samples.length; i++) {
    expect(samples[i]).toBeCloseTo(i / 256, 7);
  }

  const lift = interpolatePchip([
    { x: 0, y: 0 },
    { x: 0.5, y: 0.75 },
    { x: 1, y: 1 },
  ]);
  expect(lift(0.25)).toBeCloseTo(0.453125, 7);
  expect(lift(0.5)).toBe(0.75);
  expect(lift(0.75)).toBeCloseTo(0.921875, 7);
  expect(lift(-1)).toBe(0);
  expect(lift(2)).toBe(1);
  const leftSlope = (lift(0.5) - lift(0.5 - 0.00001)) / 0.00001;
  const rightSlope = (lift(0.5 + 0.00001) - lift(0.5)) / 0.00001;
  expect(leftSlope).toBeCloseTo(rightSlope, 3);
  const points = [
    { x: 0, y: 0 },
    { x: 0.02, y: 0.4 },
    { x: 0.3, y: 0.4 },
    { x: 0.7, y: 0.2 },
    { x: 0.99, y: 0.95 },
    { x: 1, y: 1 },
  ];
  const evaluate = interpolatePchip(points);
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    expect(evaluate(start.x)).toBeCloseTo(start.y, 10);
    let previous = start.y;
    for (let step = 1; step <= 100; step++) {
      const value = evaluate(start.x + ((end.x - start.x) * step) / 100);
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
  // An endpoint follows whichever edge of the graph the drag stays nearer.
  expect(moveCurvePoint(curve, 0, { x: 0.3, y: 0.1 })[0]).toEqual({
    x: 0.3,
    y: 0,
  });
  expect(moveCurvePoint(curve, 0, { x: 0.1, y: 0.3 })[0]).toEqual({
    x: 0,
    y: 0.3,
  });
  expect(moveCurvePoint(curve, 2, { x: 0.9, y: 0.7 })[2]).toEqual({
    x: 1,
    y: 0.7,
  });
  expect(moveCurvePoint(curve, 2, { x: 0.7, y: 0.9 })[2]).toEqual({
    x: 0.7,
    y: 1,
  });
  expect(moveCurvePoint(curve, 0, { x: 0.9, y: 0 })[0].x).toBe(0.5 - gap);
  expect(moveCurvePoint(curve, 1, { x: 2, y: 0.5 })[1].x).toBe(1 - gap);

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
