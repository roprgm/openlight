import { z } from "zod/mini";
import type {
  ColorRange,
  LuminanceRange,
  Mask,
  MaskLayer,
} from "@/core/document";
import { strokeSchema } from "@/core/document/brush";
import { hexColor, point, range, unit } from "@/lib/parse";

const positive = z.number().check(z.positive());
const percent = range(0, 100);

export const maskSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("linear"), start: point, end: point })
    .check(
      z.refine(
        ({ start, end }) => start[0] !== end[0] || start[1] !== end[1],
        "A gradient needs two distinct points",
      ),
    ),
  z.object({
    kind: z.literal("radial"),
    center: point,
    radius: z.tuple([positive, positive]),
    angle: z.number(),
    feather: unit,
  }),
  z.object({
    kind: z.literal("brush"),
    raster: z.optional(z.string().check(z.minLength(1))),
    strokes: z.array(strokeSchema),
  }),
  z
    .object({
      kind: z.literal("luminance-range"),
      low: percent,
      high: percent,
      smoothness: percent,
    })
    .check(
      z.refine(
        ({ low, high }) => low <= high,
        "A luminance range needs low at or below high",
      ),
    ),
  z.object({
    kind: z.literal("color-range"),
    color: hexColor,
    tolerance: percent,
  }),
]) satisfies z.ZodMiniType<Mask>;

export const maskOperation = z.enum([
  "add",
  "subtract",
  "intersect",
]) satisfies z.ZodMiniType<MaskLayer["operation"]>;

/** A new luminance range: the brighter half of the tones. */
export const defaultLuminanceRange: LuminanceRange = {
  kind: "luminance-range",
  low: 50,
  high: 100,
  smoothness: 25,
};

/** A new color range's tolerance; its color comes from the photo. */
export const defaultTolerance: ColorRange["tolerance"] = 30;

export const layerSettings = z.object({
  name: z.string().check(z.trim(), z.minLength(1)),
  visible: z.boolean(),
  opacity: unit,
});
