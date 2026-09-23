import { z } from "zod/mini";
import type { Mask, MaskLayer } from "@/core/document";
import { strokeSchema } from "@/core/document/brush";
import { point, unit } from "@/lib/parse";

const positive = z.number().check(z.positive());

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
  z.object({ kind: z.literal("brush"), strokes: z.array(strokeSchema) }),
]) satisfies z.ZodMiniType<Mask>;

export const maskOperation = z.enum([
  "add",
  "subtract",
]) satisfies z.ZodMiniType<MaskLayer["operation"]>;

export const layerSettings = z.object({
  name: z.string().check(z.trim(), z.minLength(1)),
  visible: z.boolean(),
  opacity: unit,
});
