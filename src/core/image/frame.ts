import { z } from "zod/mini";
import { parse, point } from "@/lib/parse";

export type Point = readonly [number, number];
export type ImageFrame = {
  center: Point;
  size: Point;
  rotation: number;
  angle: number;
  scale: Point;
};

/** Source pixels under the output center, output dimensions, and signed source scale. */
export function imageFrame(size: readonly number[]): ImageFrame {
  return {
    center: [size[0] / 2, size[1] / 2],
    size: [size[0], size[1]],
    rotation: 0,
    angle: 0,
    scale: [1, 1],
  };
}

export function frameValues(frame: ImageFrame) {
  return [
    ...frame.center,
    ...frame.size,
    ...frame.scale,
    frame.rotation,
    frame.angle,
  ];
}

const nonzero = z
  .number()
  .check(z.refine((value) => value !== 0, "Scale is zero"));
const side = z.number().check(z.minimum(1));

export const frameSchema = z.object({
  center: point,
  size: z.tuple([side, side]),
  rotation: z.number(),
  angle: z.number(),
  scale: z.tuple([nonzero, nonzero]),
});

export function validateFrame(frame: unknown): ImageFrame {
  return parse(frameSchema, frame, "Invalid image frame");
}

export function sourceOffset(frame: ImageFrame, x: number, y: number): Point {
  const angle = (-(frame.rotation + frame.angle) * Math.PI) / 180;
  const dx = x * frame.scale[0];
  const dy = y * frame.scale[1];
  return [
    Math.cos(angle) * dx - Math.sin(angle) * dy,
    Math.sin(angle) * dx + Math.cos(angle) * dy,
  ];
}

/** Output offset of a source-pixel offset: the inverse of sourceOffset. */
export function outputOffset(frame: ImageFrame, dx: number, dy: number): Point {
  const angle = ((frame.rotation + frame.angle) * Math.PI) / 180;
  return [
    (Math.cos(angle) * dx - Math.sin(angle) * dy) / frame.scale[0],
    (Math.sin(angle) * dx + Math.cos(angle) * dy) / frame.scale[1],
  ];
}

/** Affine UV mapping used by image display and resampling, independent of editing tools. */
export function frameTransform(
  frame: ImageFrame,
  sourceSize: readonly number[],
) {
  const xAxis = sourceOffset(frame, frame.size[0], 0).map(
    (value, axis) => value / sourceSize[axis],
  );
  const yAxis = sourceOffset(frame, 0, frame.size[1]).map(
    (value, axis) => value / sourceSize[axis],
  );
  const origin = frame.center.map(
    (value, axis) => value / sourceSize[axis] - (xAxis[axis] + yAxis[axis]) / 2,
  );
  return { origin, xAxis, yAxis };
}
