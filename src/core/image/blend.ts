import { z } from "zod/mini";
import type { Blend } from "@/core/document";

/** Photoshop's blend modes in menu order; `blend.wgsl` numbers them by this index. */
export const blends: readonly (readonly [Blend, string])[] = [
  ["normal", "Normal"],
  ["multiply", "Multiply"],
  ["screen", "Screen"],
  ["overlay", "Overlay"],
  ["soft-light", "Soft Light"],
  ["color", "Color"],
  ["luminosity", "Luminosity"],
];

export const blendSchema = z.enum(blends.map(([blend]) => blend));

export function blendIndex(blend: Blend) {
  return blends.findIndex(([value]) => value === blend);
}

/** The sRGB channels of a `#rrggbb` color, 0 to 1. */
export function parseColor(color: string): [number, number, number] {
  const channel = (offset: number) =>
    Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
  return [channel(1), channel(3), channel(5)];
}
