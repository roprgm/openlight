import { z } from "zod/mini";
import type { MaskRange } from "@/core/document";
import { hexColor, range } from "@/lib/parse";

const percent = range(0, 100);

export const rangeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("luminance"),
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
  z.object({ kind: z.literal("color"), color: hexColor, tolerance: percent }),
]) satisfies z.ZodMiniType<MaskRange>;

/** What a new range of each kind selects: the brighter half of the tones, or a sky blue. */
export const defaultRanges: {
  readonly [K in MaskRange["kind"]]: Extract<MaskRange, { kind: K }>;
} = {
  luminance: { kind: "luminance", low: 50, high: 100, smoothness: 25 },
  color: { kind: "color", color: "#6fa8dc", tolerance: 30 },
};
