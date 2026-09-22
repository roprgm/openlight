import type { Adjustments } from "@/core/document";

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

export function validateAdjustments(change: Partial<Adjustments>) {
  for (const [name, value] of Object.entries(change)) {
    const limit = Reflect.get(adjustmentLimits, name);
    if (
      typeof limit !== "number" ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value > limit ||
      value < -limit
    ) {
      throw new Error(`Invalid adjustment: ${name}.`);
    }
  }
}
