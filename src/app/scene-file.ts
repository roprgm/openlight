import { z } from "zod";
import {
  createDocument,
  createResources,
  type EditorDocument,
  type ProcessingLayer,
  type Scene,
  walkLayers,
} from "@/core/document";
import type { ImageSource } from "@/core/image";
import { frameSchema } from "@/core/image/frame";
import {
  adjustmentsSchema,
  defaultAdjustments,
  exposureSchema,
} from "@/features/adjustments/model";
import { defaultMixer, mixerSchema } from "@/features/color-mixer/model";
import { defaultDetails, detailsSchema } from "@/features/details/model";
import { defaultFill, fillSchema } from "@/features/fill/model";
import { healPatchSchema } from "@/features/heal/model";
import {
  layerSettings,
  maskOperation,
  maskSchema,
} from "@/features/layers/model";
import { curveSchema } from "@/features/tone-curves/curve";
import { defaultVignette, vignetteSchema } from "@/features/vignette/model";
import { whiteBalanceSchema } from "@/features/white-balance/edits";
import { parse, withDefaults } from "@/lib/parse";

/** Raised only when older files can no longer load as written; a parameter added later takes its default. */
const version = 1;

/** A saved scene: the scene as edited and the name and type of each source file, stored beside it by ID. */
export type SceneJson = {
  format: "openlight";
  version: number;
  sources: Record<string, { name: string; type: string }>;
  scene: Scene;
};

/** The document's scene and the source files it references, read without rendering. */
export function snapshotScene(document: EditorDocument) {
  const scene = document.scene.getState();
  const { source } = scene.layers[0];
  const { file } = document.resources.get(source);
  const json: SceneJson = {
    format: "openlight",
    version,
    sources: { [source]: { name: file.name, type: file.type } },
    scene,
  };
  return { json, files: new Map([[source, file]]) };
}

const id = z.string().min(1);
const adjustments = withDefaults(defaultAdjustments, adjustmentsSchema);

/** Layers nest two levels, so a child's own children must be empty. */
function processingLayer(children: z.ZodType<readonly ProcessingLayer[]>) {
  const base = { id, ...layerSettings.shape, children };
  return z.discriminatedUnion(
    "kind",
    [
      z.object({
        ...base,
        kind: z.literal("exposure"),
        exposure: exposureSchema,
      }),
      z.object({
        ...base,
        kind: z.literal("details"),
        details: withDefaults(defaultDetails, detailsSchema),
      }),
      z.object({
        ...base,
        kind: z.literal("vignette"),
        vignette: withDefaults(defaultVignette, vignetteSchema),
      }),
      z.object({
        ...base,
        kind: z.literal("color-mixer"),
        colorMixer: withDefaults(defaultMixer, mixerSchema),
      }),
      z.object({
        ...base,
        kind: z.literal("fill"),
        fill: withDefaults(defaultFill, fillSchema),
      }),
      z.object({
        ...base,
        kind: z.literal("heal"),
        patches: z.array(healPatchSchema),
      }),
      z.object({
        ...base,
        kind: z.literal("mask"),
        operation: maskOperation,
        mask: maskSchema,
        adjustments,
        toneCurve: curveSchema,
      }),
    ],
    {
      error: (issue) =>
        issue.code === "invalid_union"
          ? `Unknown layer kind: ${Reflect.get(Object(issue.input), "kind")}`
          : undefined,
    },
  );
}

function empty(message: string) {
  return z
    .array(z.unknown())
    .max(0, message)
    .transform((): ProcessingLayer[] => []);
}

const child = processingLayer(
  empty("Layers support two levels: a parent and its children"),
);

const imageLayer = z.object({
  kind: z.literal("image"),
  id,
  name: layerSettings.shape.name,
  source: id,
  whiteBalance: z
    .object({ temperature: z.number(), tint: z.number() })
    .optional(),
  adjustments,
  toneCurve: curveSchema,
  children: empty("The image layer cannot contain layers"),
});

const sceneSchema = z
  .object({
    frame: frameSchema,
    layers: z.tuple([imageLayer], processingLayer(z.array(child))),
  })
  .refine((scene) => {
    const ids = Array.from(walkLayers(scene.layers), ({ layer }) => [
      layer.id,
      ...(layer.kind === "heal" ? layer.patches.map((patch) => patch.id) : []),
    ]).flat();
    return new Set(ids).size === ids.length;
  }, "Layer and patch IDs must be unique");

const notScene = "This file doesn't contain an OpenLight scene";
const header = z.object(
  {
    format: z.literal("openlight", notScene),
    version: z.int().min(1),
  },
  notScene,
);
const savedSchema = header.extend({
  sources: z.record(
    z.string(),
    z.object({ name: z.string(), type: z.string() }),
  ),
  scene: sceneSchema,
});

/**
 * Opens a saved scene as a new document, validating every value as the edit that made it.
 * Scene files and drafts both open through here; `files` holds each source's bytes by ID.
 */
export async function openScene(
  saved: unknown,
  files: ReadonlyMap<string, Blob>,
  decode: (file: File) => Promise<ImageSource>,
) {
  if (parse(header, saved, "Invalid scene").version > version) {
    throw Error("This scene needs a newer version of OpenLight.");
  }
  const { sources, scene } = parse(savedSchema, saved, "Invalid scene");
  const [image, ...layers] = scene.layers;
  const source = sources[image.source];
  const data = files.get(image.source);
  if (!source || !data) {
    throw Error("The scene's image is missing.");
  }
  const sourceFile = new File([data], source.name, { type: source.type });
  const decoded = await decode(sourceFile);
  const asShot = decoded.raw?.asShot;
  // Absolute white balance applies only to RAW images, which fall back to their as-shot balance.
  const whiteBalance =
    asShot && image.whiteBalance
      ? parse(
          whiteBalanceSchema(asShot),
          image.whiteBalance,
          "Invalid RAW white balance",
        )
      : asShot;
  const resources = createResources();
  try {
    resources.add(sourceFile, decoded, image.source);
    return createDocument(
      {
        frame: scene.frame,
        layers: [{ ...image, whiteBalance }, ...layers],
      },
      resources,
    );
  } catch (error) {
    resources.dispose();
    throw error;
  }
}
