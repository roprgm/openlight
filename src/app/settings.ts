import type {
  EditorDocument,
  ImageLayer,
  ProcessingLayer,
  Scene,
} from "@/core/document";
import type { WhiteBalance } from "@/core/image";
import { type ImageFrame, type Point, validateFrame } from "@/core/image/frame";
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

/** Raised only when older files can no longer load as written; a parameter added later takes its default. */
const version = 1;

/** The scene without its session-bound image source, plus the image dimensions its geometry is measured in. */
type Settings = {
  format: "openlight";
  version: number;
  image: { name: string; size: Point };
  scene: {
    frame: ImageFrame;
    layers: readonly [Omit<ImageLayer, "source">, ...ProcessingLayer[]];
  };
};

export function isSettingsFile(file: File) {
  return /\.openlight$/i.test(file.name);
}

/** The document's edits as a file named after its image; the pixels stay in the image. */
export function writeSettings(document: EditorDocument) {
  const {
    frame,
    layers: [{ source, ...image }, ...layers],
  } = document.scene.getState();
  const { file, image: pixels } = document.resources.get(source);
  const settings: Settings = {
    format: "openlight",
    version,
    image: { name: file.name, size: pixels.size },
    scene: { frame, layers: [image, ...layers] },
  };
  const name = file.name.replace(/\.[^.]*$/, "") || "settings";
  return new File([JSON.stringify(settings)], `${name}.openlight`, {
    type: "application/json",
  });
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

/** Absolute white balance applies only to RAW images, which keep their as-shot balance without one. */
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

/** The scene a settings file describes for the document's image, validated as the edits that made it. */
export function readSettings(text: string, document: EditorDocument): Scene {
  const settings: Settings = JSON.parse(text);
  if (settings?.format !== "openlight") {
    throw Error("This file doesn't contain OpenLight settings.");
  }
  if (!Number.isInteger(settings.version) || settings.version < 1) {
    throw Error("Invalid settings version.");
  }
  if (settings.version > version) {
    throw Error("These settings need a newer version of OpenLight.");
  }
  const current = document.scene.getState().layers[0];
  const { image, raw } = document.resources.get(current.source);
  const size = settings.image?.size;
  if (!Array.isArray(size) || size.length !== 2) {
    throw Error("Settings need the image size.");
  }
  if (size[0] !== image.size[0] || size[1] !== image.size[1]) {
    throw Error(
      `These settings are for a ${size.join(" × ")} image, not ${image.size.join(" × ")}.`,
    );
  }
  const { frame, layers } = settings.scene ?? {};
  validateFrame(frame);
  if (!Array.isArray(layers) || layers[0]?.kind !== "image") {
    throw Error("Settings must start with the image layer.");
  }
  const [base, ...rest] = layers;
  const ids = new Set<string>();
  readId(base.id, ids);
  if (base.children?.length) {
    throw Error("The image layer cannot contain layers.");
  }
  validateCurve(base.toneCurve);
  const scene: Scene = {
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
        id: base.id,
        name: current.name,
        source: current.source,
        whiteBalance: readWhiteBalance(base.whiteBalance, raw?.asShot),
        adjustments: complete(
          defaultAdjustments,
          base.adjustments,
          validateAdjustments,
        ),
        toneCurve: base.toneCurve,
        children: [],
      },
      ...rest.map((layer) => readLayer(layer, ids)),
    ],
  };
  validateDepth(scene.layers);
  return scene;
}
