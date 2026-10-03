import { expect, test } from "bun:test";
import { createMapping } from "@/components/editor/mapping";
import { type ImageFrame, imageFrame, type Point } from "@/core/image/frame";

const source: Point = [1200, 800];
// The strongest Horizontal on a thin crop in a wide viewport, which reaches past the horizon on the left.
const frame: ImageFrame = {
  ...imageFrame(source),
  size: [200, 800],
  perspective: [100, 0],
};
const viewport: Point = [4000, 800];
const mapping = createMapping(
  frame,
  source,
  { zoom: 1, pan: [0, 0] },
  1,
  viewport,
);
const inside = (point: Point) =>
  point[0] >= 0 &&
  point[0] <= source[0] &&
  point[1] >= 0 &&
  point[1] <= source[1];

test("pointer input maps exactly into the corrected photo and stops short of the horizon", () => {
  for (const point of [
    [2000, 400],
    [1950, 100],
    [2090, 790],
    [1800, 300],
  ] as const) {
    const at = mapping.toDocument(point);
    if (!at) throw Error("Missing document point.");
    const back = mapping.toScreen(at);
    expect(back?.[0]).toBeCloseTo(point[0], 6);
    expect(back?.[1]).toBeCloseTo(point[1], 6);
  }
  // Left of the photo the viewport crosses where input stops, then the horizon itself.
  expect(mapping.toDocument([100, 400])).toBeUndefined();

  // A sparse stroke leaves the photo past where input stops and comes back elsewhere: it joins
  // along that line, far outside the photo, instead of bridging across it.
  const photo: Point = [2000, 300];
  const away: Point = [100, 400];
  const back: Point = [2050, 600];
  const leaving = mapping.trail(photo, away);
  const returning = mapping.trail(away, back);
  expect(leaving).toHaveLength(1);
  expect(returning).toHaveLength(2);
  const [exit] = leaving;
  const [entry, end] = returning;
  expect(inside(end)).toBe(true);
  expect(exit[0]).toBeCloseTo(entry[0], 6);
  expect(exit[0]).toBeLessThan(-source[0]);
  expect(mapping.trail(away, [50, 600])).toEqual([]);
});

test("a dab's outline is its exact image, and an oversized one keeps the part the viewport shows", () => {
  const center: Point = [1000, 300];
  const radius = 120;
  const dab = mapping.ellipse({ center, radii: [radius, radius], angle: 0 });
  if (!dab || !("ellipse" in dab)) throw Error("Expected a bounded ellipse.");
  const { ellipse } = dab;
  const turn = (ellipse.angle * Math.PI) / 180;
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * 2 * Math.PI;
    const point = mapping.toScreen([
      center[0] + radius * Math.cos(t),
      center[1] + radius * Math.sin(t),
    ]);
    if (!point) throw Error("Missing screen point.");
    const dx = point[0] - ellipse.center[0];
    const dy = point[1] - ellipse.center[1];
    const u = (dx * Math.cos(turn) + dy * Math.sin(turn)) / ellipse.radii[0];
    const v = (dy * Math.cos(turn) - dx * Math.sin(turn)) / ellipse.radii[1];
    expect(Math.hypot(u, v)).toBeCloseTo(1, 9);
  }
  // Its image is wider toward the enlarged right edge than a circle of the same area.
  expect(ellipse.radii[0]).not.toBeCloseTo(ellipse.radii[1], 3);

  // A brush larger than the photo reaches past the correction's horizon: no ellipse, but a path.
  const huge = mapping.ellipse({ center, radii: [5000, 5000], angle: 0 });
  if (!huge || !("path" in huge)) throw Error("Expected a clipped path.");
  expect(huge.path).not.toContain("NaN");
  expect(huge.path).not.toContain("Infinity");
  const coordinates = huge.path.match(/-?[\d.e+-]+/g)?.map(Number) ?? [];
  expect(coordinates.length).toBeGreaterThan(8);
});
