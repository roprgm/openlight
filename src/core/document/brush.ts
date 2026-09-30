import { z } from "zod/mini";
import { hexColor, unit } from "@/lib/parse";

/** Finite source-pixel coordinates and a pressure from 0 to 1. */
export const strokePoints = z
  .array(z.tuple([z.number(), z.number(), unit]))
  .check(z.minLength(1));

export const strokeSchema = z.object({
  mode: z.enum(["paint", "erase"]),
  size: z.number().check(z.positive()),
  feather: unit,
  flow: unit,
  points: strokePoints,
});

export const paintStrokeSchema = z.extend(strokeSchema, { color: hexColor });
