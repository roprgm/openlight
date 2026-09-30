import { z } from "zod/mini";
import { paintStrokeSchema } from "@/core/document/brush";
import { blendSchema } from "@/core/image/blend";

/** A paint layer's own fields, as edits and scene files check them. */
export const paintShape = {
  blend: blendSchema,
  raster: z.optional(z.string().check(z.minLength(1))),
  strokes: z.array(paintStrokeSchema),
};
