import { z } from "zod/mini";
import type { Grain } from "@/core/document";
import { range } from "@/lib/parse";

export const defaultGrain: Readonly<Grain> = {
  amount: 0,
  size: 25,
  roughness: 50,
};

export const grainSchema = z.object({
  amount: range(0, 100),
  size: range(0, 100),
  roughness: range(0, 100),
}) satisfies z.ZodMiniType<Grain>;
