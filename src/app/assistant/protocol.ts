import { z } from "zod/mini";
import type { Adjustments } from "@/core/document";

// Runs in the browser and in the serverless function, so it imports no app module at runtime.

const value = z.number().check(z.refine(Number.isFinite, "Not finite"));

/** The parts of the open photo the assistant reads. */
const photo = z.object({
  adjustments: z.object({
    exposure: value,
    contrast: value,
    highlights: value,
    shadows: value,
    whites: value,
    blacks: value,
    incrementalTemperature: value,
    incrementalTint: value,
    vibrance: value,
    saturation: value,
  }) satisfies z.ZodMiniType<Adjustments>,
  vignette: value,
  clarity: value,
  sharpening: value,
  toneCurve: z.array(z.object({ x: value, y: value })).check(z.maxLength(64)),
  comparison: z.enum(["edited", "original", "split"]),
  sourceSize: z.tuple([value, value]),
});

const text = z.string().check(z.trim(), z.minLength(1), z.maxLength(500));

/** A message to the assistant, with the user's earlier messages for context. */
export const assistantRequest = z.object({
  message: text,
  earlier: z.array(text).check(z.maxLength(3)),
  photo,
});
export type AssistantRequest = z.output<typeof assistantRequest>;
export type Photo = AssistantRequest["photo"];

/** The assistant's answer: commands to run in order, and a message for the user. */
export const assistantResponse = z.object({
  commands: z.array(z.unknown()),
  message: z.string(),
});
export type AssistantResponse = z.output<typeof assistantResponse>;
