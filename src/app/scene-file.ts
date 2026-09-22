import {
  createDocument,
  createResources,
  type EditorDocument,
  type ProcessingLayer,
  type Scene,
} from "@/core/document";
import type { ImageSource, WhiteBalance } from "@/core/image";
import { validateFrame } from "@/core/image/frame";
import {
  defaultAdjustments,
  validateAdjustments,
} from "@/features/adjustments/model";
import { defaultMixer, validateMixer } from "@/features/color-mixer/model";
import { defaultDetails, validateDetails } from "@/features/details/model";
import { defaultFill, validateFill } from "@/features/fill/model";
import { validateHealPatch } from "@/features/heal/model";
import {
  validateDepth,
  validateExposure,
  validateLayerSettings,
  validateMask,
  validateMaskOperation,
} from "@/features/layers/edits";
import { validateCurve } from "@/features/tone-curves/curve";
import { validateVignette } from "@/features/vignette/edits";
import { defaultVignette } from "@/features/vignette/model";
import { validateWhiteBalance } from "@/features/white-balance/edits";
import { readZip, writeZip } from "@/lib/zip";

/** Raised only when older files can no longer load as written; a parameter added later takes its default. */
const version = 1;

/** A saved scene: the scene as edited and the name and type of each source file, stored beside it by ID. */
export type SceneJson = {
  format: "openlight";
  version: number;
  sources: Record<string, { name: string; type: string }>;
  scene: Scene;
};

export const sceneExtension = ".openlight";

/** Sources are stored, so only `scene.json` inflates; a scene with 7,000 stroke points is about 200 kB. */
const inflateLimit = 256 * 2 ** 20;

export function isSceneFile(file: File) {
  return file.name.toLowerCase().endsWith(sceneExtension);
}

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

/** The document as a ZIP archive: a deflated `scene.json` and each source's bytes at `sources/<id>`. */
export async function writeSceneFile(document: EditorDocument) {
  const { json, files } = snapshotScene(document);
  const archive = await writeZip([
    {
      name: "scene.json",
      data: new Blob([JSON.stringify(json)]),
      deflate: true,
    },
    ...[...files].map(([id, file]) => ({ name: `sources/${id}`, data: file })),
  ]);
  const [file] = files.values();
  const name = file.name.replace(/\.[^.]*$/, "") || "scene";
  return new File([archive], `${name}${sceneExtension}`);
}

function readId(id: string, ids: Set<string>) {
  if (typeof id !== "string" || !id || ids.has(id)) {
    throw Error("Layer and patch IDs must be unique strings.");
  }
  ids.add(id);
}

/** Parameters missing from a group take their defaults, so older files load after the group gains one. */
function complete<T extends object>(
  defaults: T,
  value: Partial<T> | undefined,
  validate: (value: T) => void,
) {
  const merged = { ...defaults, ...value };
  validate(merged);
  return merged;
}

/** Absolute white balance applies only to RAW images, which fall back to their as-shot balance. */
function readWhiteBalance(
  balance: WhiteBalance | undefined,
  asShot: WhiteBalance | undefined,
) {
  if (!asShot || !balance) {
    return asShot;
  }
  const whiteBalance = { temperature: balance.temperature, tint: balance.tint };
  validateWhiteBalance(whiteBalance, asShot);
  return whiteBalance;
}

function readLayer(layer: ProcessingLayer, ids: Set<string>): ProcessingLayer {
  const { id, name, visible, opacity, children } = layer;
  readId(id, ids);
  validateLayerSettings({ name, visible, opacity });
  if (!Array.isArray(children)) {
    throw Error("Layer children must be a list.");
  }
  const base = {
    id,
    name,
    visible,
    opacity,
    children: children.map((child) => readLayer(child, ids)),
  };
  switch (layer.kind) {
    case "exposure":
      validateExposure(layer.exposure);
      return { ...base, kind: layer.kind, exposure: layer.exposure };
    case "details":
      return {
        ...base,
        kind: layer.kind,
        details: complete(defaultDetails, layer.details, validateDetails),
      };
    case "vignette":
      return {
        ...base,
        kind: layer.kind,
        vignette: complete(defaultVignette, layer.vignette, validateVignette),
      };
    case "color-mixer":
      return {
        ...base,
        kind: layer.kind,
        colorMixer: complete(defaultMixer, layer.colorMixer, validateMixer),
      };
    case "fill":
      return {
        ...base,
        kind: layer.kind,
        fill: complete(defaultFill, layer.fill, validateFill),
      };
    case "heal":
      if (!Array.isArray(layer.patches)) {
        throw Error("A Healing layer needs a list of patches.");
      }
      for (const patch of layer.patches) {
        readId(patch.id, ids);
        validateHealPatch(patch);
      }
      return { ...base, kind: layer.kind, patches: layer.patches };
    case "mask":
      validateMaskOperation(layer.operation);
      validateMask(layer.mask);
      validateCurve(layer.toneCurve);
      return {
        ...base,
        kind: layer.kind,
        operation: layer.operation,
        mask: layer.mask,
        adjustments: complete(
          defaultAdjustments,
          layer.adjustments,
          validateAdjustments,
        ),
        toneCurve: layer.toneCurve,
      };
    default: {
      const unknown: never = layer;
      throw Error(`Unknown layer kind: ${Reflect.get(unknown, "kind")}.`);
    }
  }
}

/**
 * Opens a saved scene as a new document, validating every value as the edit that made it.
 * Scene files and drafts both open through here; `files` holds each source's bytes by ID.
 */
export async function openScene(
  saved: SceneJson,
  files: ReadonlyMap<string, Blob>,
  decode: (file: File) => Promise<ImageSource>,
) {
  if (saved?.format !== "openlight") {
    throw Error("This file doesn't contain an OpenLight scene.");
  }
  if (!Number.isInteger(saved.version) || saved.version < 1) {
    throw Error("Invalid scene version.");
  }
  if (saved.version > version) {
    throw Error("This scene needs a newer version of OpenLight.");
  }
  const { frame, layers } = saved.scene ?? {};
  validateFrame(frame);
  if (!Array.isArray(layers) || layers[0]?.kind !== "image") {
    throw Error("A scene must start with its image layer.");
  }
  const [image, ...rest] = layers;
  const ids = new Set<string>();
  readId(image.id, ids);
  validateLayerSettings({ name: image.name });
  if (image.children?.length) {
    throw Error("The image layer cannot contain layers.");
  }
  validateCurve(image.toneCurve);
  const adjustments = complete(
    defaultAdjustments,
    image.adjustments,
    validateAdjustments,
  );
  const children = rest.map((layer) => readLayer(layer, ids));
  validateDepth(children);
  const source = saved.sources?.[image.source];
  const data = files.get(image.source);
  if (typeof source?.name !== "string" || !data) {
    throw Error("The scene's image is missing.");
  }
  const sourceFile = new File([data], source.name, { type: source.type });
  const decoded = await decode(sourceFile);
  const resources = createResources();
  try {
    const id = resources.add(sourceFile, decoded, image.source);
    return createDocument(
      {
        frame: {
          center: frame.center,
          size: frame.size,
          rotation: frame.rotation,
          angle: frame.angle,
          scale: frame.scale,
        },
        layers: [
          {
            kind: "image",
            id: image.id,
            name: image.name,
            source: id,
            whiteBalance: readWhiteBalance(
              image.whiteBalance,
              decoded.raw?.asShot,
            ),
            adjustments,
            toneCurve: image.toneCurve,
            children: [],
          },
          ...children,
        ],
      },
      resources,
    );
  } catch (error) {
    resources.dispose();
    throw error;
  }
}

export async function openSceneFile(
  file: Blob,
  decode: (file: File) => Promise<ImageSource>,
) {
  const entries = await readZip(file, inflateLimit);
  const json = entries.get("scene.json");
  if (!json) {
    throw Error("This file doesn't contain an OpenLight scene.");
  }
  const files = new Map(
    [...entries].flatMap(([name, data]) =>
      name.startsWith("sources/") ? [[name.slice(8), data] as const] : [],
    ),
  );
  return openScene(JSON.parse(await json.text()), files, decode);
}
