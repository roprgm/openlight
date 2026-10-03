import { z } from "zod/mini";
import {
  completeFields,
  createDocument,
  createResources,
  type EditorDocument,
  type ProcessingLayer,
  paintingOf,
  type RemoveField,
  removePatches,
  type Scene,
  sceneFields,
  settledPixels,
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
import { defaultGrain, grainSchema } from "@/features/grain/model";
import { fieldLatticeSchema, healPatchSchema } from "@/features/heal/model";
import { validateBrushLayers } from "@/features/layers/edits";
import {
  layerSettings,
  maskOperation,
  maskSchema,
} from "@/features/layers/model";
import { lutSchema } from "@/features/lut/model";
import { paintShape } from "@/features/paint/model";
import { curveSchema } from "@/features/tone-curves/curve";
import { defaultVignette, vignetteSchema } from "@/features/vignette/model";
import { whiteBalanceSchema } from "@/features/white-balance/edits";
import { parse, withDefaults } from "@/lib/parse";

/** Raised only when older files can no longer load as written; a parameter added later takes its default. */
const version = 2;

const savedHealPatch = z.pipe(
  z.transform((input) => {
    if (
      typeof input !== "object" ||
      input === null ||
      "strokes" in input ||
      !("stroke" in input)
    ) {
      return input;
    }
    const { stroke, ...patch } = input;
    return { ...patch, strokes: [stroke] };
  }),
  healPatchSchema,
);

/**
 * Where a saved Remove field's texels sit, or nothing while it waits to be synthesized. Files from when
 * a field extended an earlier one may name that `base`, which opening ignores.
 */
type SavedField =
  | {
      readonly origin: readonly [number, number];
      readonly scale: number;
      readonly size: readonly [number, number];
    }
  | { readonly base?: string };

/**
 * A saved scene: the scene as edited, the name and type of each source file, and each Remove field it
 * names, whose texels and files are stored beside it by ID.
 */
export type SceneJson = {
  format: "openlight";
  version: number;
  sources: Record<string, { name: string; type: string }>;
  fields: Record<string, SavedField>;
  scene: Scene;
};

/**
 * The document's scene and what it names, taken now without rendering: the source file, the pixels its
 * paint settled into, and its Remove fields, some of which may still be waiting to be synthesized.
 */
export function snapshotScene(document: EditorDocument) {
  const scene = document.scene.getState();
  const { source } = scene.layers[0];
  return {
    scene,
    source: { id: source, file: document.resources.get(source).file },
    paint: settledPixels(document, scene),
    fields: sceneFields(document, scene),
  };
}

export type SceneSnapshot = ReturnType<typeof snapshotScene>;

/**
 * A snapshot as a saved scene's JSON and the files it names, once the editor reads back the Remove
 * fields it shows that the snapshot still waits for; rejects when a readback fails.
 */
export async function completeScene(
  document: EditorDocument,
  { scene, source, paint, fields: taken }: SceneSnapshot,
) {
  const fields: Record<string, SavedField> = {};
  const texels = new Map<string, Blob>();
  for (const [id, field] of await completeFields(document, taken)) {
    if (field) {
      const { texels: data, ...lattice } = field;
      fields[id] = lattice;
      texels.set(id, data);
    } else {
      fields[id] = {};
    }
  }
  const json: SceneJson = {
    format: "openlight",
    version,
    sources: {
      [source.id]: { name: source.file.name, type: source.file.type },
    },
    fields,
    scene,
  };
  return {
    json,
    sources: new Map([[source.id, source.file]]),
    paint,
    fields: texels,
  };
}

const id = z.string().check(z.minLength(1));
const adjustments = withDefaults(defaultAdjustments, adjustmentsSchema);

/** Layers nest two levels, so a child's own children must be empty. */
function processingLayer(children: z.ZodMiniType<readonly ProcessingLayer[]>) {
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
        kind: z.literal("grain"),
        grain: withDefaults(defaultGrain, grainSchema),
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
      z.object({ ...base, kind: z.literal("lut"), lut: lutSchema }),
      z.object({
        ...base,
        kind: z.literal("heal"),
        patches: z.array(savedHealPatch),
      }),
      z.object({ ...base, kind: z.literal("paint"), ...paintShape }),
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
  return z.pipe(
    z.array(z.unknown()).check(z.maxLength(0, message)),
    z.transform((): ProcessingLayer[] => []),
  );
}

const child = processingLayer(
  empty("Layers support two levels: a parent and its children"),
);

const imageLayer = z.object({
  kind: z.literal("image"),
  id,
  name: layerSettings.shape.name,
  source: id,
  whiteBalance: z.optional(
    z.object({ temperature: z.number(), tint: z.number() }),
  ),
  adjustments,
  toneCurve: curveSchema,
  children: empty("The image layer cannot contain layers"),
});

const sceneSchema = z
  .object({
    frame: frameSchema,
    layers: z.tuple([imageLayer], processingLayer(z.array(child))),
  })
  .check(
    z.refine((scene) => {
      const ids = Array.from(walkLayers(scene.layers), ({ layer }) => [
        layer.id,
        ...(layer.kind === "heal"
          ? layer.patches.map((patch) => patch.id)
          : []),
      ]).flat();
      return new Set(ids).size === ids.length;
    }, "Layer and patch IDs must be unique"),
  );

const notScene = "This file doesn't contain an OpenLight scene";
const header = z.object(
  {
    format: z.literal("openlight", notScene),
    version: z.int().check(z.minimum(1)),
  },
  notScene,
);
const savedField = z.union([
  fieldLatticeSchema,
  z.strictObject({ base: z.optional(id) }),
]) satisfies z.ZodMiniType<SavedField>;
const savedSchema = z.extend(header, {
  sources: z.record(
    z.string(),
    z.object({ name: z.string(), type: z.string() }),
  ),
  fields: z.record(id, savedField),
  scene: sceneSchema,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every patch object among saved layers and their children, as written. */
function* savedPatches(layers: unknown): Generator<Record<string, unknown>> {
  if (!Array.isArray(layers)) return;
  for (const layer of layers) {
    if (!isRecord(layer)) continue;
    if (Array.isArray(layer.patches)) {
      yield* layer.patches.filter(isRecord);
    }
    yield* savedPatches(layer.children);
  }
}

/**
 * A version 1 scene as version 2 writes it: each Remove patch named its field inline, with how many
 * strokes it covered, and now names it by ID beside the scene. A patch whose field covered fewer of
 * its strokes, or that had none, reserves one to synthesize its whole shape.
 */
function migrateFields(saved: unknown) {
  if (!isRecord(saved) || saved.version !== 1 || !isRecord(saved.scene)) {
    return saved;
  }
  const migrated = structuredClone(saved);
  const fields: Record<string, unknown> = {};
  for (const patch of savedPatches(
    Reflect.get(Object(migrated.scene), "layers"),
  )) {
    if (patch.mode !== "remove") continue;
    // A patch from before patches held strokes held one.
    const strokes = Array.isArray(patch.strokes) ? patch.strokes.length : 1;
    const {
      texels,
      strokes: covered,
      ...lattice
    } = isRecord(patch.field) ? patch.field : {};
    if (typeof texels === "string" && covered === strokes) {
      fields[texels] = lattice;
      patch.field = texels;
    } else {
      const reserved = crypto.randomUUID();
      fields[reserved] = {};
      patch.field = reserved;
    }
  }
  return { ...migrated, fields };
}

/** Whether every field a patch names is saved. */
function fieldsComplete(scene: Scene, fields: SceneJson["fields"]) {
  return [...removePatches(scene.layers)].every(({ patch }) =>
    Object.hasOwn(fields, patch.field),
  );
}

/**
 * Opens a saved scene as a new document, validating every value as the edit that made it.
 * Scene files and drafts both open through here; `files` holds each source's bytes, the pixels each
 * paint layer settled into, and the texels of each Remove field, by ID.
 */
export async function openScene(
  saved: unknown,
  files: ReadonlyMap<string, Blob>,
  decode: (file: File) => Promise<ImageSource>,
) {
  if (parse(header, saved, "Invalid scene").version > version) {
    throw Error("This scene needs a newer version of OpenLight.");
  }
  const { sources, fields, scene } = parse(
    savedSchema,
    migrateFields(saved),
    "Invalid scene",
  );
  validateBrushLayers(scene.layers);
  if (!fieldsComplete(scene, fields)) {
    throw Error("The scene's Remove fields are missing.");
  }
  const stored = new Map<string, RemoveField | undefined>();
  for (const [id, field] of Object.entries(fields)) {
    if (!("origin" in field)) {
      stored.set(id, undefined);
      continue;
    }
    const texels = files.get(id);
    if (!texels) {
      throw Error("The scene's Remove fields are missing.");
    }
    stored.set(id, { texels, ...field });
  }
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
    for (const { layer } of walkLayers(layers)) {
      const raster = paintingOf(layer)?.raster;
      if (raster) {
        const pixels = files.get(raster);
        if (!pixels) {
          throw Error("The scene's paint is missing.");
        }
        resources.addPaint(pixels, raster);
      }
    }
    for (const [id, field] of stored) {
      resources.addField(id, field);
    }
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
