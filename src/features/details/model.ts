import { z } from "zod";
import type { Details } from "@/core/document";

export const defaultDetails: Details = {
  clarity: 0,
  sharpening: 0,
  sharpenRadius: 1,
};
export const detailLimits = {
  clarity: [-100, 100],
  sharpening: [0, 150],
  sharpenRadius: [0.5, 3],
} as const;

const range = ([min, max]: readonly [number, number]) =>
  z.number().min(min).max(max);

export const detailsSchema = z.object({
  clarity: range(detailLimits.clarity),
  sharpening: range(detailLimits.sharpening),
  sharpenRadius: range(detailLimits.sharpenRadius),
}) satisfies z.ZodType<Details>;
