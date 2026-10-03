import { expect, test } from "bun:test";
import {
  frameTransform,
  type ImageFrame,
  imageFrame,
  type Point,
  validateFrame,
} from "@/core/image/frame";
import {
  correct,
  correctShown,
  fitRatio,
  flip,
  move,
  resize,
  rotate,
  shownPerspective,
  turn,
} from "@/features/crop/geometry";

const source: Point = [1200, 800];
const corners = [0, 1].flatMap((x) => [0, 1].map((y) => [x, y] as const));
function sample(frame: ImageFrame, x: number, y: number) {
  const { origin, xAxis, yAxis } = frameTransform(frame, source);
  const [u, v, w] = origin.map(
    (value, axis) => value + x * xAxis[axis] + y * yAxis[axis],
  );
  expect(w).toBeGreaterThan(0);
  return [u / w, v / w];
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
  // Perspective keeps the photo's center; the strongest settings keep every corner covered.
  for (const perspective of [
    [0, 0],
    [60, -80],
    [-100, 100],
  ] as const) {
    for (const rotation of [0, 90, 270]) {
      for (const angle of [-45, 0, 30]) {
        const before = rotate(
          correct(
            { ...edge, center: [480, 360], rotation },
            perspective,
            source,
          ),
          angle,
          source,
        );
        expect(before.perspective).toEqual(perspective);
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
                const next = resize(
                  flipped,
                  handle,
                  delta,
                  delta,
                  ratio,
                  source,
                );
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
  }
});

test("perspective keeps the source under the crop's center, undoes exactly, and follows the displayed axes", () => {
  const frame: ImageFrame = {
    ...imageFrame(source),
    center: [620, 380],
    size: [1100, 700],
  };
  const corrected = correct(frame, [40, -70], source);
  expectCovered(corrected);
  expectSame(sample(corrected, 0.5, 0.5), sample(frame, 0.5, 0.5));
  expect(Math.abs(corrected.scale[0])).toBeLessThan(1);
  const restored = correct(corrected, [0, 0], source);
  expectSame([...restored.center, ...restored.scale], [...frame.center, 1, 1]);

  // Vertical stays vertical as displayed through every quarter turn and flip.
  const length = (a: number[], b: number[]) =>
    Math.hypot((a[0] - b[0]) * source[0], (a[1] - b[1]) * source[1]);
  for (const turns of [0, 1, 2, 3]) {
    for (const flips of [[], [0], [1], [0, 1]]) {
      let oriented: ImageFrame = { ...imageFrame(source), size: [500, 300] };
      for (let i = 0; i < turns; i++) oriented = turn(oriented, 1);
      for (const axis of flips) oriented = flip(oriented, axis);
      const shown = correctShown(oriented, [25, -60], source);
      expect(shownPerspective(shown)).toEqual([25, -60]);
      const vertical = correctShown(oriented, [0, 80], source);
      const [nw, ne, sw, se] = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([x, y]) => sample(vertical, x, y));
      // More Vertical enlarges the displayed bottom, so less of the photo fills it; the sides match.
      expect(length(sw, se)).toBeLessThan(length(nw, ne));
      expect(length(nw, sw)).toBeCloseTo(length(ne, se), 6);
    }
  }
});
