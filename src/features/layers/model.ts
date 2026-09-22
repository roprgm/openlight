import { z } from "zod";
import type { Mask, MaskLayer } from "@/core/document";
import { strokeSchema } from "@/core/document/brush";
import { point, unit } from "@/lib/parse";

export const maskSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("linear"), start: point, end: point })
    .refine(
      ({ start, end }) => start[0] !== end[0] || start[1] !== end[1],
      "A gradient needs two distinct points",
    ),
  z.object({
    kind: z.literal("radial"),
    center: point,
    radius: z.tuple([z.number().positive(), z.number().positive()]),
    angle: z.number(),
    feather: unit,
  }),
  z.object({ kind: z.literal("brush"), strokes: z.array(strokeSchema) }),
]) satisfies z.ZodType<Mask>;

export const maskOperation = z.enum(["add", "subtract"]) satisfies z.ZodType<
  MaskLayer["operation"]
>;

export const layerSettings = z.object({
  name: z.string().trim().min(1),
  visible: z.boolean(),
  opacity: unit,
});
