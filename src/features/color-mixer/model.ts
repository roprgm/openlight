import { z } from "zod/mini";
import type { ColorMixer } from "@/core/document";
import { change, range } from "@/lib/parse";

// Oklab angles of the eight full-saturation sRGB colors, for circular interpolation.
export const colors = [
  { id: "red", label: "Red", hue: 0, angle: 29.23389 },
  { id: "orange", label: "Orange", hue: 30, angle: 52.77574 },
  { id: "yellow", label: "Yellow", hue: 60, angle: 109.76923 },
  { id: "green", label: "Green", hue: 120, angle: 142.49534 },
  { id: "aqua", label: "Aqua", hue: 180, angle: 194.76895 },
  { id: "blue", label: "Blue", hue: 240, angle: 264.05202 },
  { id: "purple", label: "Purple", hue: 270, angle: 293.77405 },
  { id: "magenta", label: "Magenta", hue: 300, angle: 328.36342 },
] as const;

export const channels = [
  { id: "hue", label: "Hue" },
  { id: "saturation", label: "Saturation" },
  { id: "luminance", label: "Luminance" },
] as const;

export type MixerColor = (typeof colors)[number]["id"];
export type MixerChannel = keyof ColorMixer;
export type MixerChange = Partial<Record<MixerChannel, number>>;

const zeros = Object.freeze(colors.map(() => 0));
export const defaultMixer: ColorMixer = Object.freeze({
  hue: zeros,
  saturation: zeros,
  luminance: zeros,
});

export function isNeutral(mixer: ColorMixer) {
  return channels.every(({ id }) => mixer[id].every((value) => value === 0));
}

const shift = range(-100, 100);
const shifts = z.array(shift).check(z.length(colors.length));

export const mixerSchema = z.object({
  hue: shifts,
  saturation: shifts,
  luminance: shifts,
}) satisfies z.ZodMiniType<ColorMixer>;

/** One color's channels; unspecified channels keep their values. */
export const mixerChange = change(
  z.object({ hue: shift, saturation: shift, luminance: shift }),
);
export const mixerColor = z.enum(colors.map(({ id }) => id));
