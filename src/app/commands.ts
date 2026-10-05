import { z } from "zod/mini";
import type { EditorDocument } from "@/core/document";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import {
  adjustmentsSchema,
  defaultAdjustments,
} from "@/features/adjustments/model";
import { setColorMixer } from "@/features/color-mixer/edits";
import { mixerChange, mixerColor } from "@/features/color-mixer/model";
import { applyCrop } from "@/features/crop/edits";
import { fitRatio, rotate } from "@/features/crop/geometry";
import { setDetails } from "@/features/details/edits";
import { detailsSchema } from "@/features/details/model";
import { setGrain } from "@/features/grain/edits";
import { grainSchema } from "@/features/grain/model";
import { addLayer, deleteLayer } from "@/features/layers/edits";
import { maskSchema } from "@/features/layers/model";
import { setNoiseReduction } from "@/features/noise-reduction/edits";
import { noiseReductionSchema } from "@/features/noise-reduction/model";
import { curveSchema, defaultCurve } from "@/features/tone-curves/curve";
import { setToneCurve } from "@/features/tone-curves/edits";
import { setVignette } from "@/features/vignette/edits";
import { vignetteSchema } from "@/features/vignette/model";
import { setWhiteBalance } from "@/features/white-balance/edits";
import { change, parse, range } from "@/lib/parse";
import { createMask, editEffect } from "./editor/layers";
import type { Workspace } from "./workspace";

/** The layer a command edited or created, so a caller can select it. */
export type CommandResult = { layerId?: string };

function command<S extends z.ZodMiniType>(
  description: string,
  input: S,
  run: (
    document: EditorDocument,
    input: z.output<S>,
  ) => CommandResult | undefined,
) {
  return {
    description,
    input,
    execute: (document: EditorDocument, value: unknown, subject: string) =>
      run(document, parse(input, value, subject)) ?? {},
  };
}

function image(document: EditorDocument) {
  return document.scene.getState().layers[0];
}

function sourceSize(document: EditorDocument) {
  return document.resources.get(image(document).source).image.size;
}

/** Removes every layer and returns the image's settings and frame to how the photo opened, as one entry. */
function reset(document: EditorDocument) {
  const layer = image(document);
  const source = document.resources.get(layer.source);
  document.history.commit();
  document.edit({
    frame: imageFrame(source.image.size),
    layers: [
      {
        ...layer,
        adjustments: { ...defaultAdjustments },
        toneCurve: defaultCurve,
        whiteBalance: source.raw?.asShot,
        noiseReduction: undefined,
      },
    ],
  });
  document.selectLayer(layer.id);
  return { layerId: layer.id };
}

const none = z.strictObject({});
const layerId = z.optional(z.string());

/**
 * Serializable edits to the open document, by type. Each validates its input like the matching
 * control; the control API's `run` and the WebMCP tools run them.
 */
export const commands = {
  "set-adjustments": command(
    "Sets basic adjustments, keeping the ones omitted. Exposure is in stops from -5 to 5; the others go from -100 to 100, where 0 is neutral. Without layerId they tone the whole photo; with a mask's layerId they apply inside that mask.",
    z.extend(change(adjustmentsSchema), { layerId }),
    (document, { layerId, ...adjustments }) => {
      setAdjustments(document, adjustments, layerId);
      return { layerId: layerId ?? image(document).id };
    },
  ),
  "set-tone-curve": command(
    "Replaces the tone curve: points map input x to output y, from shadows at x 0 to highlights at x 1, ordered by x. Omit points to reset it. Without layerId it tones the whole photo after its adjustments; with a mask's layerId it applies inside that mask.",
    z.strictObject({ points: z.optional(curveSchema), layerId }),
    (document, { points, layerId }) => {
      setToneCurve(document, points, layerId);
      return { layerId: layerId ?? image(document).id };
    },
  ),
  "set-white-balance": command(
    "Sets a RAW photo's white balance: temperature in Kelvin from 2000 to 25000 and tint from -150 to 150. Other photos have no white balance; warm or cool them with set-adjustments' incrementalTemperature and incrementalTint.",
    z.partial(z.strictObject({ temperature: z.number(), tint: z.number() })),
    (document, change) => {
      setWhiteBalance(document, change);
      return { layerId: image(document).id };
    },
  ),
  "set-noise-reduction": command(
    "Reduces the photo's noise before its adjustments, a RAW photo's before demosaicing: luminance and color from 0, none, to 100, keeping omitted values. 50 removes the noise the photo measures; more smooths further. The first reduction of a photo takes a moment; later strengths apply at once. RAW files without a 2 × 2 mosaic, such as Fujifilm X-Trans, have none.",
    change(noiseReductionSchema),
    (document, change) => {
      setNoiseReduction(document, change);
      return { layerId: image(document).id };
    },
  ),
  "set-color-mixer": command(
    "Shifts one color range's hue, saturation, or luminance from -100 to 100, keeping other colors and omitted values. Neutral grays are unaffected. Without layerId it edits the first Color Mixer layer, creating one when there is none.",
    z.extend(mixerChange, { color: mixerColor, layerId }),
    (document, { color, layerId, ...change }) => ({
      layerId: editEffect(document, "color-mixer", layerId, (id) =>
        setColorMixer(document, color, change, id),
      ),
    }),
  ),
  "set-details": command(
    "Sets clarity (local contrast, -100 to 100), sharpening (0 to 150), and sharpenRadius (0.5 to 3 pixels), keeping omitted values. Without layerId it edits the first Details layer, creating one when there is none.",
    z.extend(change(detailsSchema), { layerId }),
    (document, { layerId, ...details }) => ({
      layerId: editEffect(document, "details", layerId, (id) =>
        setDetails(document, details, id),
      ),
    }),
  ),
  "set-vignette": command(
    "Darkens the photo's edges: intensity from 0 (off) to 100 and softness from 0 to 100, keeping omitted values. Without layerId it edits the first Vignette layer, creating one when there is none.",
    z.extend(change(vignetteSchema), { layerId }),
    (document, { layerId, ...vignette }) => ({
      layerId: editEffect(document, "vignette", layerId, (id) =>
        setVignette(document, vignette, id),
      ),
    }),
  ),
  "set-grain": command(
    "Adds film grain: amount from 0 (off) to 100, size from 0 (fine) to 100 (coarse), and roughness from 0 (even) to 100 (clumped), keeping omitted values. Without layerId it edits the first Grain layer, creating one when there is none.",
    z.extend(change(grainSchema), { layerId }),
    (document, { layerId, ...grain }) => ({
      layerId: editEffect(document, "grain", layerId, (id) =>
        setGrain(document, grain, id),
      ),
    }),
  ),
  "add-mask": command(
    "Adds a mask layer on top of the stack with optional adjustments, as one edit, and returns its layerId. Coordinates are source pixels, unaffected by crop. A linear mask covers fully at start and fades out at end; a radial mask covers an ellipse around center with radius [x, y], angle in degrees, and feather from 0 to 1. A luminance-range mask selects pixels of the photo whose lightness lies from low to high, 0 black to 100 white, fading over smoothness; a color-range mask selects pixels near a #rrggbb color in hue and saturation, however light, within tolerance from 0 to 100. A null color has no coverage until a color is chosen.",
    z.strictObject({
      mask: maskSchema,
      adjustments: z.optional(change(adjustmentsSchema)),
    }),
    (document, { mask, adjustments }) => {
      const layer = createMask(mask);
      return {
        layerId: addLayer(document, {
          ...layer,
          adjustments: { ...layer.adjustments, ...adjustments },
        }),
      };
    },
  ),
  "delete-layer": command(
    "Removes a layer and the layers inside it.",
    z.strictObject({ layerId: z.string() }),
    (document, { layerId }) => {
      deleteLayer(document, layerId);
    },
  ),
  "set-crop": command(
    "Replaces the crop, rotation, and flips with the largest centered crop of the photo, keeping its perspective correction. aspectRatio is width / height and defaults to the photo's; straighten rotates by -45 to 45 degrees. Omit both to remove the crop.",
    z.strictObject({
      aspectRatio: z.optional(z.number().check(z.positive())),
      straighten: z.optional(range(-45, 45)),
    }),
    (document, { aspectRatio, straighten = 0 }) => {
      const size = sourceSize(document);
      const { perspective } = document.scene.getState().frame;
      const frame = rotate(
        { ...imageFrame(size), perspective },
        straighten,
        size,
      );
      applyCrop(document, aspectRatio ? fitRatio(frame, aspectRatio) : frame);
    },
  ),
  reset: command(
    "Removes every layer and returns the photo's adjustments, tone curve, white balance, crop, and perspective to how it opened, as one edit.",
    none,
    reset,
  ),
  undo: command("Undoes the last edit.", none, (document) => {
    document.history.undo();
  }),
  redo: command("Redoes the last undone edit.", none, (document) => {
    document.history.redo();
  }),
  "set-preview": command(
    "Shows the edited photo, the original, or a split comparison of both, without editing the photo.",
    z.strictObject({ comparison: z.enum(["edited", "original", "split"]) }),
    (document, { comparison }) => {
      document.preview.setState({ comparison });
    },
  ),
};

type Commands = typeof commands;

/** A command's fields; zod types an empty object as a record of `never`, which would forbid `type`. */
type Fields<T> = string extends keyof T ? unknown : T;

/** A command as data: its type and its fields. */
export type Command = {
  [Type in keyof Commands]: { type: Type } & Fields<
    z.input<Commands[Type]["input"]>
  >;
}[keyof Commands];

const byType = new Map(Object.entries(commands));
const envelope = z.looseObject({ type: z.string() });

/** Validates and runs one command on the open document. */
export function runCommand(
  workspace: Workspace,
  value: unknown,
): CommandResult {
  const { type, ...input } = parse(envelope, value, "Invalid command");
  const definition = byType.get(type);
  if (!definition) {
    throw Error(`Unknown command: ${type}.`);
  }
  return definition.execute(workspace.getDocument(), input, `Invalid ${type}`);
}
