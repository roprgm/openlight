import type {
  EditorDocument,
  EffectLayer,
  ImageLayer,
  Layer,
  Mask,
  MaskLayer,
  ProcessingLayer,
} from "@/core/document";
import type { WhiteBalance } from "@/core/image";
import { defaultAdjustments } from "@/features/adjustments/model";
import { defaultMixer, isNeutral } from "@/features/color-mixer/model";
import { defaultDetails } from "@/features/details/model";
import { defaultFill } from "@/features/fill/model";
import { defaultCurve } from "@/features/tone-curves/curve";

function baseLayer() {
  return { id: crypto.randomUUID(), visible: true, opacity: 1, children: [] };
}

export function createImageLayer(
  source: string,
  name: string,
  whiteBalance?: WhiteBalance,
): ImageLayer {
  return {
    kind: "image",
    id: crypto.randomUUID(),
    name,
    source,
    whiteBalance,
    adjustments: { ...defaultAdjustments },
    toneCurve: defaultCurve,
    children: [],
  };
}

export function createLayer<K extends EffectLayer["kind"]>(
  kind: K,
): Extract<EffectLayer, { kind: K }>;
export function createLayer(kind: EffectLayer["kind"]): EffectLayer {
  const base = baseLayer();
  switch (kind) {
    case "details":
      return { ...base, kind, name: "Details", details: { ...defaultDetails } };
    case "exposure":
      return { ...base, kind, name: "Exposure", exposure: 1 };
    case "vignette":
      return {
        ...base,
        kind,
        name: "Vignette",
        vignette: { intensity: 50, softness: 50 },
      };
    case "color-mixer":
      return { ...base, kind, name: "Color Mixer", colorMixer: defaultMixer };
    case "fill":
      return { ...base, kind, name: "Color", fill: { ...defaultFill } };
    case "heal":
      return { ...base, kind, name: "Healing", patches: [] };
    default:
      throw Error("Unknown layer kind.");
  }
}

const maskNames: Record<Mask["kind"], string> = {
  linear: "Linear Gradient",
  radial: "Radial Gradient",
  brush: "Brush",
};

export function createMask(
  mask: Mask,
  operation: MaskLayer["operation"] = "add",
): MaskLayer {
  return {
    ...baseLayer(),
    kind: "mask",
    name: maskNames[mask.kind],
    operation,
    adjustments: { ...defaultAdjustments },
    toneCurve: defaultCurve,
    mask,
  };
}

function effectNeutral(layer: ProcessingLayer): boolean {
  if (!layer.visible || layer.opacity === 0) {
    return true;
  }
  switch (layer.kind) {
    case "details":
      return layer.details.clarity === 0 && layer.details.sharpening === 0;
    case "exposure":
      return layer.exposure === 0;
    case "vignette":
      return layer.vignette.intensity === 0;
    case "color-mixer":
      return isNeutral(layer.colorMixer);
    case "fill":
      return false;
    case "heal":
      return layer.patches.length === 0;
    case "mask":
      return true;
  }
}

/** A mask that changes nothing yet: default adjustments and curve, and no active child effect. */
export function maskNeutral(layer: MaskLayer) {
  return (
    Object.entries(defaultAdjustments).every(
      ([key, value]) => Reflect.get(layer.adjustments, key) === value,
    ) &&
    layer.toneCurve.every((point) => point.x === point.y) &&
    layer.children.every(effectNeutral)
  );
}

/** The first root effect of a kind. */
export function findEffect<K extends EffectLayer["kind"]>(
  layers: readonly Layer[],
  kind: K,
) {
  return layers.find(
    (layer): layer is Extract<EffectLayer, { kind: K }> => layer.kind === kind,
  );
}

/** Convenience commands address the first root effect of a kind or create one on top of the stack as one entry. */
export function editEffect(
  document: EditorDocument,
  kind: EffectLayer["kind"],
  id: string | undefined,
  edit: (id: string) => void,
) {
  const scene = document.scene.getState();
  const existing = id ?? findEffect(scene.layers, kind)?.id;
  if (existing) {
    edit(existing);
    return;
  }
  const layer = createLayer(kind);
  const opened = document.history.begin();
  try {
    document.edit({ ...scene, layers: [...scene.layers, layer] });
    edit(layer.id);
    if (opened) {
      document.history.commit();
    }
  } catch (error) {
    if (opened) {
      document.history.cancel();
    }
    throw error;
  }
}
