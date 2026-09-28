import { z } from "zod/mini";
import type { EditorDocument } from "@/core/document";
import { imageFrame } from "@/core/image/frame";
import { adjustmentsSchema } from "@/features/adjustments/model";
import { mixerChange, mixerColor } from "@/features/color-mixer/model";
import { fitRatio, rotate } from "@/features/crop/geometry";
import { detailsSchema } from "@/features/details/model";
import { addLayer } from "@/features/layers/edits";
import { maskSchema } from "@/features/layers/model";
import { curveSchema } from "@/features/tone-curves/curve";
import { vignetteSchema } from "@/features/vignette/model";
import { change, parse, range } from "@/lib/parse";
import type { createControls } from "./controls";
import { createMask } from "./editor/layers";
import type { Workspace } from "./workspace";

type Controls = ReturnType<typeof createControls>;

type ModelContextTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: unknown) => Promise<unknown>;
};

type RegisteredTool = { name: string; description: string };

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool(
        tool: ModelContextTool,
        options?: { signal?: AbortSignal },
      ): Promise<void>;
      getTools(): Promise<RegisteredTool[]>;
      executeTool(tool: RegisteredTool, input: string): Promise<string>;
    };
  }
}

function defineTool<S extends z.ZodMiniType>(
  name: string,
  description: string,
  input: S,
  run: (input: z.output<S>) => unknown,
  annotations?: ModelContextTool["annotations"],
): ModelContextTool {
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(input, { io: "input" }),
    annotations,
    async execute(value) {
      try {
        return run(parse(input, value, "Invalid input")) ?? "Done.";
      } catch (error) {
        // Returned, since browsers pass a thrown error to the agent without its message.
        return String(error);
      }
    },
  };
}

function sourceSize(document: EditorDocument) {
  const [image] = document.scene.getState().layers;
  return document.resources.get(image.source).image.size;
}

/** The open photo as an agent reads it; brush strokes and healing patches are counted, not listed. */
function describe(workspace: Workspace, controls: Controls) {
  const { file, failure, scene, selectedLayerId, preview, history } =
    controls.getState();
  const document = workspace.state.getState().document;
  const state = {
    file,
    failure,
    sourceSize: document && sourceSize(document),
    frame: scene?.frame,
    layers: scene?.layers,
    selectedLayerId,
    comparison: preview?.comparison,
    history,
  };
  return JSON.stringify(state, (key, value) =>
    Array.isArray(value) && (key === "strokes" || key === "patches")
      ? `${value.length} omitted`
      : value,
  );
}

const none = z.strictObject({});
const layerId = z.optional(z.string());

/** Registers the editor's commands as WebMCP tools for browser agents until `signal` aborts. */
export function registerTools(
  workspace: Workspace,
  controls: Controls,
  signal: AbortSignal,
) {
  const context = document.modelContext;
  if (!context) {
    return;
  }
  const tools = [
    defineTool(
      "get_state",
      "Describes the open photo: its file, source size in pixels, crop frame, layers from bottom to top with their IDs and settings, and undo history. Color mixer arrays list red, orange, yellow, green, aqua, blue, purple, and magenta. Call it first; when no photo is open, ask the user to open one.",
      none,
      () => describe(workspace, controls),
      { readOnlyHint: true },
    ),
    defineTool(
      "set_adjustments",
      "Sets basic adjustments, keeping the ones omitted. Exposure is in stops from -5 to 5; the others go from -100 to 100, where 0 is neutral. Without layerId they tone the whole photo; with a mask's layerId they apply inside that mask.",
      z.extend(change(adjustmentsSchema), { layerId }),
      ({ layerId, ...adjustments }) =>
        controls.setAdjustments(adjustments, layerId),
    ),
    defineTool(
      "set_tone_curve",
      "Replaces the tone curve: points map input x to output y, from shadows at x 0 to highlights at x 1, ordered by x. Omit points to reset it. Without layerId it tones the whole photo after its adjustments; with a mask's layerId it applies inside that mask.",
      z.strictObject({ points: z.optional(curveSchema), layerId }),
      ({ points, layerId }) => controls.setToneCurve(points, layerId),
    ),
    defineTool(
      "set_white_balance",
      "Sets a RAW photo's white balance: temperature in Kelvin from 2000 to 25000 and tint from -150 to 150. Other photos have no white balance; warm or cool them with set_adjustments' incrementalTemperature and incrementalTint.",
      z.partial(z.strictObject({ temperature: z.number(), tint: z.number() })),
      (change) => controls.setWhiteBalance(change),
    ),
    defineTool(
      "set_color_mixer",
      "Shifts one color range's hue, saturation, or luminance from -100 to 100, keeping other colors and omitted values. Neutral grays are unaffected.",
      z.extend(mixerChange, { color: mixerColor }),
      ({ color, ...change }) => controls.setColorMixer(color, change),
    ),
    defineTool(
      "set_details",
      "Sets clarity (local contrast, -100 to 100), sharpening (0 to 150), and sharpenRadius (0.5 to 3 pixels), keeping omitted values.",
      change(detailsSchema),
      (change) => controls.setDetails(change),
    ),
    defineTool(
      "set_vignette",
      "Darkens the photo's edges: intensity from 0 (off) to 100 and softness from 0 to 100, keeping omitted values.",
      change(vignetteSchema),
      (change) => controls.setVignette(change),
    ),
    defineTool(
      "add_mask",
      "Adds a mask layer and returns its layerId; give it adjustments or a tone curve with that layerId. Coordinates are source pixels (see sourceSize), unaffected by crop. A linear mask covers fully at start and fades out at end; a radial mask covers an ellipse around center with radius [x, y], angle in degrees, and feather from 0 to 1.",
      z.strictObject({ mask: maskSchema }),
      ({ mask }) => ({
        layerId: addLayer(workspace.getDocument(), createMask(mask)),
      }),
    ),
    defineTool(
      "delete_layer",
      "Removes a layer and the layers inside it.",
      z.strictObject({ layerId: z.string() }),
      ({ layerId }) => controls.deleteLayer(layerId),
    ),
    defineTool(
      "set_crop",
      "Replaces the crop, rotation, and flips with the largest centered crop of the photo. aspectRatio is width / height and defaults to the photo's; straighten rotates by -45 to 45 degrees. Omit both to remove the crop.",
      z.strictObject({
        aspectRatio: z.optional(z.number().check(z.positive())),
        straighten: z.optional(range(-45, 45)),
      }),
      ({ aspectRatio, straighten = 0 }) => {
        const size = sourceSize(workspace.getDocument());
        const frame = rotate(imageFrame(size), straighten, size);
        controls.setFrame(aspectRatio ? fitRatio(frame, aspectRatio) : frame);
      },
    ),
    defineTool(
      "undo",
      "Undoes the last edit and returns the history.",
      none,
      () => {
        controls.undo();
        return controls.getState().history;
      },
    ),
    defineTool(
      "redo",
      "Redoes the last undone edit and returns the history.",
      none,
      () => {
        controls.redo();
        return controls.getState().history;
      },
    ),
    defineTool(
      "set_preview",
      "Shows the edited photo, the original, or a split comparison of both, without editing the photo.",
      z.strictObject({ comparison: z.enum(["edited", "original", "split"]) }),
      ({ comparison }) => controls.setPreview({ comparison }),
    ),
  ];
  for (const tool of tools) {
    void context.registerTool(tool, { signal });
  }
}
