import { z } from "zod/mini";
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
  color: z.string().check(z.regex(/^#[0-9a-f]{6}$/i), z.toLowerCase()),
  blend: z.enum(blends.map(([blend]) => blend)),
}) satisfies z.ZodMiniType<Fill>;

/** The sRGB channels of a `#rrggbb` color, 0 to 1. */
export function parseColor(color: string): [number, number, number] {
  const channel = (offset: number) =>
    Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
  return [channel(1), channel(3), channel(5)];
}
