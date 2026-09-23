import { z } from "zod/mini";
import type { Adjustments } from "@/core/document";
import { range } from "@/lib/parse";

export const defaultAdjustments: Adjustments = {
  exposure: 0,
  incrementalTemperature: 0,
  incrementalTint: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  vibrance: 0,
  saturation: 0,
};

export const adjustmentLimits: Adjustments = {
  exposure: 5,
  incrementalTemperature: 100,
  incrementalTint: 100,
  contrast: 100,
  highlights: 100,
  shadows: 100,
  whites: 100,
  blacks: 100,
  vibrance: 100,
  saturation: 100,
};

const signed = (limit: number) => range(-limit, limit);

export const adjustmentsSchema = z.object({
  exposure: signed(adjustmentLimits.exposure),
  incrementalTemperature: signed(adjustmentLimits.incrementalTemperature),
  incrementalTint: signed(adjustmentLimits.incrementalTint),
  contrast: signed(adjustmentLimits.contrast),
  highlights: signed(adjustmentLimits.highlights),
  shadows: signed(adjustmentLimits.shadows),
  whites: signed(adjustmentLimits.whites),
  blacks: signed(adjustmentLimits.blacks),
  vibrance: signed(adjustmentLimits.vibrance),
  saturation: signed(adjustmentLimits.saturation),
}) satisfies z.ZodMiniType<Adjustments>;

/** An Exposure layer's value, in EV like the adjustment. */
export const exposureSchema = signed(adjustmentLimits.exposure);
