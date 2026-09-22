import { z } from "zod";
import type { Blend, Fill } from "@/core/document";

export const blends: readonly (readonly [Blend, string])[] = [
  ["normal", "Normal"],
  ["multiply", "Multiply"],
  ["screen", "Screen"],
  ["overlay", "Overlay"],
  ["soft-light", "Soft Light"],
  ["color", "Color"],
  ["luminosity", "Luminosity"],
];

export const defaultFill: Readonly<Fill> = {
  color: "#f0763c",
  blend: "normal",
};

export const fillSchema = z.object({
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .toLowerCase(),
  blend: z.enum(blends.map(([blend]) => blend)),
}) satisfies z.ZodType<Fill>;

/** The sRGB channels of a `#rrggbb` color, 0 to 1. */
export function parseColor(color: string): [number, number, number] {
  const channel = (offset: number) =>
    Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
  return [channel(1), channel(3), channel(5)];
}
