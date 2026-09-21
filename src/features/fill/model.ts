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

export function validateFill(change: Partial<Fill>) {
  for (const [name, value] of Object.entries(change)) {
    const valid =
      name === "color"
        ? typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
        : name === "blend" && blends.some(([blend]) => blend === value);
    if (!valid) {
      throw new Error(`Invalid fill setting: ${name}.`);
    }
  }
}

/** The sRGB channels of a `#rrggbb` color, 0 to 1. */
export function parseColor(color: string): [number, number, number] {
  return [1, 3, 5].map(
    (offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255,
  ) as [number, number, number];
}
