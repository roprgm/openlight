import { z } from "zod/mini";
import type { Vignette } from "@/core/document";
import { range } from "@/lib/parse";

export const defaultVignette: Readonly<Vignette> = {
  intensity: 0,
  softness: 50,
};

export const vignetteSchema = z.object({
  intensity: range(0, 100),
  softness: range(0, 100),
}) satisfies z.ZodMiniType<Vignette>;
