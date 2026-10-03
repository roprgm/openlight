import { z } from "zod/mini";
import { parse } from "@/lib/parse";
import { type Settings, settingsSchema } from "./settings";

/** Raised only when older presets can no longer apply as written. */
const version = 1;

export const presetExtension = ".openlight-preset";

/** Far above any preset, whose curve holds at most 1025 points; a larger file isn't read. */
const maxBytes = 256 * 1024;

export type Preset = { readonly name: string; readonly settings: Settings };

export const presetName = z
  .string()
  .check(
    z.trim(),
    z.minLength(1, "Name the preset"),
    z.maxLength(64, "Use at most 64 characters"),
  );

const notPreset = "This file doesn't contain an OpenLight preset";
const header = z.object(
  {
    format: z.literal("openlight-preset", notPreset),
    version: z.int().check(z.minimum(1)),
  },
  notPreset,
);
const presetSchema = z.extend(header, {
  name: presetName,
  settings: settingsSchema,
});

/** A preset as a file and as storage hold it. */
export function presetJson({ name, settings }: Preset) {
  return { format: "openlight-preset", version, name, settings };
}

/** Validates a preset from a file or storage, which an earlier or later version may have written. */
export function readPreset(value: unknown): Preset {
  if (parse(header, value, "Invalid preset").version > version) {
    throw Error("This preset needs a newer version of OpenLight.");
  }
  const { name, settings } = parse(presetSchema, value, "Invalid preset");
  return { name, settings };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw Error(`${notPreset}.`);
  }
}

export async function readPresetFile(file: File) {
  if (file.size > maxBytes) {
    throw Error(`${notPreset}.`);
  }
  return readPreset(parseJson(await file.text()));
}

export function writePresetFile(preset: Preset) {
  return new File(
    [JSON.stringify(presetJson(preset), null, 2)],
    `${preset.name}${presetExtension}`,
    { type: "application/json" },
  );
}
