import { z } from "zod/mini";
import type { Fill } from "@/core/document";
import { blendSchema } from "@/core/image/blend";
import { hexColor } from "@/lib/parse";

export const defaultFill: Readonly<Fill> = {
  color: "#f0763c",
  blend: "normal",
};

export const fillSchema = z.object({
  color: hexColor,
  blend: blendSchema,
}) satisfies z.ZodMiniType<Fill>;
