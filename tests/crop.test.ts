import { expect, test } from "bun:test";
import {
  frameTransform,
  type ImageFrame,
  imageFrame,
  type Point,
  validateFrame,
} from "@/core/image/frame";
import {
  fitRatio,
  flip,
  move,
  resize,
  rotate,
  turn,
} from "@/features/crop/geometry";

const source: Point = [1200, 800];
const corners = [0, 1].flatMap((x) => [0, 1].map((y) => [x, y] as const));
function sample(frame: ImageFrame, x: number, y: number) {
  const { origin, xAxis, yAxis } = frameTransform(frame, source);
  return origin.map((value, axis) => value + x * xAxis[axis] + y * yAxis[axis]);
}
function expectSame(actual: number[], expected: number[]) {
  for (const [i, value] of actual.entries()) {
    expect(value).toBeCloseTo(expected[i], 8);
  }
}
function expectCovered(frame: ImageFrame) {
  for (const [x, y] of corners) {
    for (const value of sample(frame, x, y)) {
      expect(value).toBeGreaterThanOrEqual(-1e-9);
      expect(value).toBeLessThanOrEqual(1 + 1e-9);
    }
  }
}

test("crop preserves source coverage, opposite anchors, flips, and sliding along edges", () => {
  const edge: ImageFrame = {
    ...imageFrame(source),
    center: [900, 400],
    size: [600, 400],
  };
  expect(move(edge, 120, 80, source).center).toEqual([900, 480]);
  const minimum = resize(imageFrame(source), "se", -1200, -800, null, source);
  for (const ratio of [16 / 9, 3 / 4, 1]) {
    const next = fitRatio(minimum, ratio);
    expect(() => validateFrame(next)).not.toThrow();
    expect(next.size[0] / next.size[1]).toBeCloseTo(ratio, 10);
    expect(next.center).toEqual(minimum.center);
    expectCovered(next);
  }
  for (const rotation of [0, 90, 270]) {
    for (const angle of [-45, 0, 30]) {
      const before = rotate(
        { ...edge, center: [480, 360], rotation },
        angle,
        source,
      );
      for (const axis of [0, 1]) {
        const flipped = flip(before, axis);
        expectCovered(flipped);
        for (const [x, y] of corners) {
          const [fx, fy] = axis === 0 ? [1 - x, y] : [x, 1 - y];
          expectSame(sample(flipped, x, y), sample(before, fx, fy));
        }
        const turned = turn(flipped, 1);
        expectCovered(turned);
        expect(turn(turned, -1)).toEqual(flipped);
        // Each handle anchors the opposite corner or edge midpoint.
        for (const [handle, x, y] of [
          ["nw", 1, 1],
          ["se", 0, 0],
          ["n", 0.5, 1],
          ["e", 0, 0.5],
        ] as const) {
          for (const delta of [-1200, 1200]) {
            for (const ratio of [before.size[0] / before.size[1], null]) {
              const next = resize(flipped, handle, delta, delta, ratio, source);
              expectCovered(next);
              expectSame(sample(next, x, y), sample(flipped, x, y));
              expect(next.scale).toBe(flipped.scale);
              if (ratio) {
                expect(next.size[0] / next.size[1]).toBeCloseTo(ratio, 8);
              } else if (x === 0.5) {
                expect(next.size[0]).toBe(flipped.size[0]);
              } else if (y === 0.5) {
                expect(next.size[1]).toBe(flipped.size[1]);
              }
              expectCovered(move(next, delta, delta, source));
              expectCovered(rotate(next, -angle, source));
            }
          }
        }
      }
    }
  }
});
