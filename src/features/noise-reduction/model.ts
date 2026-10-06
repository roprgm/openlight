import { z } from "zod/mini";
import type { NoiseReduction } from "@/core/image";
import { range } from "@/lib/parse";

/** How much noise reduction removes from light and from color, each 0 to 100; 0 keeps it. */
export const noiseReductionSchema = z.object({
  luminance: range(0, 100),
  color: range(0, 100),
}) satisfies z.ZodMiniType<NoiseReduction>;

/**
 * Per spectrum component, its share of the reduction, 0 to 1, and its limit at a share of one half,
 * in noise deviations: less for detail the filter removes more of, more for color, which holds
 * little. Light follows luminance, the two color differences color, and the greens' difference, which
 * demosaicing draws as a maze, the stronger of the two.
 */
export function componentLimits({ luminance, color }: NoiseReduction) {
  return {
    shares: [luminance, color, color, Math.max(luminance, color)].map(
      (amount) => amount / 100,
    ),
    halves: [1, 3, 3, 0.7],
  };
}
