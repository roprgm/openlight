import { z } from "zod/mini";
import { parse, point, range } from "@/lib/parse";
import {
  apply,
  type Homography,
  jacobian,
  multiply,
  stretch,
} from "@/lib/projective";

export type Point = readonly [number, number];
export type ImageFrame = {
  center: Point;
  size: Point;
  rotation: number;
  angle: number;
  scale: Point;
  /** Keystone along the source's x and y axes, −100 to 100: more enlarges its right or bottom edge. */
  perspective: Point;
};

/**
 * Corrected pixels under the output center, output dimensions, signed scale, and the perspective
 * correction the source takes first. Without perspective, corrected pixels are source pixels.
 */
export function imageFrame(size: readonly number[]): ImageFrame {
  return {
    center: [size[0] / 2, size[1] / 2],
    size: [size[0], size[1]],
    rotation: 0,
    angle: 0,
    scale: [1, 1],
    perspective: [0, 0],
  };
}

export function frameValues(frame: ImageFrame) {
  return [
    ...frame.center,
    ...frame.size,
    ...frame.scale,
    frame.rotation,
    frame.angle,
    ...frame.perspective,
  ];
}

const nonzero = z
  .number()
  .check(z.refine((value) => value !== 0, "Scale is zero"));
const side = z.number().check(z.minimum(1));
const keystone = range(-100, 100);

export const frameSchema = z.object({
  center: point,
  size: z.tuple([side, side]),
  rotation: z.number(),
  angle: z.number(),
  scale: z.tuple([nonzero, nonzero]),
  // Frames from before perspective correction have none.
  perspective: z._default(z.tuple([keystone, keystone]), [0, 0]),
});

export function validateFrame(frame: unknown): ImageFrame {
  return parse(frameSchema, frame, "Invalid image frame");
}

/** Corrected-pixel offset of an output offset, through rotation, flips, and scale. */
export function correctedOffset(
  frame: ImageFrame,
  x: number,
  y: number,
): Point {
  const angle = (-(frame.rotation + frame.angle) * Math.PI) / 180;
  const dx = x * frame.scale[0];
  const dy = y * frame.scale[1];
  return [
    Math.cos(angle) * dx - Math.sin(angle) * dy,
    Math.sin(angle) * dx + Math.cos(angle) * dy,
  ];
}

/** Output offset of a corrected-pixel offset: the inverse of correctedOffset. */
export function outputOffset(frame: ImageFrame, dx: number, dy: number): Point {
  const angle = ((frame.rotation + frame.angle) * Math.PI) / 180;
  return [
    (Math.cos(angle) * dx - Math.sin(angle) * dy) / frame.scale[0],
    (Math.sin(angle) * dx + Math.cos(angle) * dy) / frame.scale[1],
  ];
}

/**
 * The correction's weights over source coordinates running from −1 to 1 across the photo: a point
 * corrects to itself over 1 + weights·point, so the center stays and lines stay straight. At 100 an
 * edge takes 1/0.55 of its scale and the opposite one 1/1.45; at full strength on both axes every
 * corner keeps a weight of 0.1 or more, in front of the horizon where the weight reaches 0.
 */
function weights(frame: ImageFrame): Point {
  return [-0.0045 * frame.perspective[0], -0.0045 * frame.perspective[1]];
}

/**
 * The perspective correction as a homogeneous map from source to corrected pixels, or back with
 * `inverse`, the same map with opposite weights. A point in front of either maps in front of the other.
 */
export function correction(
  frame: ImageFrame,
  source: readonly number[],
  inverse = false,
): Homography {
  const sign = inverse ? -1 : 1;
  const [qx, qy] = weights(frame);
  const [wx, wy] = [(2 * sign * qx) / source[0], (2 * sign * qy) / source[1]];
  const [hx, hy] = [source[0] / 2, source[1] / 2];
  const bias = sign * (qx + qy);
  return [
    1 + hx * wx,
    hx * wy,
    -hx * bias,
    hy * wx,
    1 + hy * wy,
    -hy * bias,
    wx,
    wy,
    1 - bias,
  ];
}

/** Output pixels, from the output center, to homogeneous source pixels. */
export function outputToSource(
  frame: ImageFrame,
  source: readonly number[],
): Homography {
  const [ax, ay] = correctedOffset(frame, 1, 0);
  const [bx, by] = correctedOffset(frame, 0, 1);
  const [cx, cy] = frame.center;
  return multiply(correction(frame, source, true), [
    ax,
    bx,
    cx,
    ay,
    by,
    cy,
    0,
    0,
    1,
  ]);
}

/** Source pixels to homogeneous output pixels, from the output center. */
export function sourceToOutput(
  frame: ImageFrame,
  source: readonly number[],
): Homography {
  const [ax, ay] = outputOffset(frame, 1, 0);
  const [bx, by] = outputOffset(frame, 0, 1);
  const [cx, cy] = frame.center;
  return multiply(
    [ax, bx, -ax * cx - bx * cy, ay, by, -ay * cx - by * cy, 0, 0, 1],
    correction(frame, source),
  );
}

/**
 * How much the perspective correction enlarges the photo where the output shows it largest, at
 * one of its corners: 1 without perspective.
 */
export function correctionStretch(
  frame: ImageFrame,
  source: readonly number[],
) {
  const toSource = outputToSource(frame, source);
  const correct = correction(frame, source);
  return Math.max(
    ...[-1, 1].flatMap((x) =>
      [-1, 1].map((y) => {
        const [sx, sy, w] = apply(toSource, [
          (x * frame.size[0]) / 2,
          (y * frame.size[1]) / 2,
        ]);
        return stretch(jacobian(correct, [sx / w, sy / w]));
      }),
    ),
  );
}

/**
 * Homogeneous UV mapping used by image display and resampling, independent of editing tools: an
 * output UV reaches source UV `origin + u·xAxis + v·yAxis` over the sum of their third components,
 * 1 without perspective.
 */
export function frameTransform(
  frame: ImageFrame,
  sourceSize: readonly number[],
) {
  const xAxis = correctedOffset(frame, frame.size[0], 0).map(
    (value, axis) => value / sourceSize[axis],
  );
  const yAxis = correctedOffset(frame, 0, frame.size[1]).map(
    (value, axis) => value / sourceSize[axis],
  );
  const origin = frame.center.map(
    (value, axis) => value / sourceSize[axis] - (xAxis[axis] + yAxis[axis]) / 2,
  );
  // Corrected UV u reaches source UV (u + (w − 1)/2) / w, w = 1 − weights·(2u − 1).
  const [wx, wy] = weights(frame);
  const slope = ([x, y]: number[]) => -2 * (wx * x + wy * y);
  const level = 1 + slope(origin) + wx + wy;
  const axis = (values: number[], weight: number, base = 0) => [
    ...values.map((value) => value + (weight - base) / 2),
    weight,
  ];
  return {
    origin: axis(origin, level, 1),
    xAxis: axis(xAxis, slope(xAxis)),
    yAxis: axis(yAxis, slope(yAxis)),
  };
}
