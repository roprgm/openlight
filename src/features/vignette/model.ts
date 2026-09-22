import { z } from "zod";
import type { Vignette } from "@/core/document";

export const defaultVignette: Readonly<Vignette> = {
  intensity: 0,
  softness: 50,
};

export const vignetteSchema = z.object({
  intensity: z.number().min(0).max(100),
  softness: z.number().min(0).max(100),
}) satisfies z.ZodType<Vignette>;
