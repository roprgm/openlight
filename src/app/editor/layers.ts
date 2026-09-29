import { ColorMixerIcon } from "@/components/icons/color-mixer";
import { DetailsIcon } from "@/components/icons/details";
import { ExposureIcon } from "@/components/icons/exposure";
import { GrainIcon } from "@/components/icons/grain";
import { HealIcon } from "@/components/icons/heal";
import { LutIcon } from "@/components/icons/lut";
import { VignetteIcon } from "@/components/icons/vignette";
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
import type { LookupTable } from "@/core/image/lut";
import { defaultAdjustments } from "@/features/adjustments/model";
import { defaultMixer, isNeutral } from "@/features/color-mixer/model";
import { defaultDetails } from "@/features/details/model";
import { defaultFill } from "@/features/fill/model";
import { defaultGrain } from "@/features/grain/model";
import type { EffectKind } from "@/features/layers/controls";
import { addLayer, type LayerPlacement } from "@/features/layers/edits";
import { defaultCurve } from "@/features/tone-curves/curve";
import { defaultVignette } from "@/features/vignette/model";

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

/** Every effect kind's name and mark, in Add menu order; the stack and new layers read it. */
export const effectKinds = [
  { kind: "details", label: "Details", Icon: DetailsIcon, addable: true },
  { kind: "exposure", label: "Exposure", Icon: ExposureIcon, addable: true },
  {
    kind: "color-mixer",
    label: "Color Mixer",
    Icon: ColorMixerIcon,
    addable: true,
  },
  { kind: "vignette", label: "Vignette", Icon: VignetteIcon, addable: true },
  { kind: "grain", label: "Grain", Icon: GrainIcon, addable: true },
  { kind: "fill", label: "Color", addable: true },
  { kind: "lut", label: "LUT", Icon: LutIcon, addable: true },
  { kind: "heal", label: "Healing", Icon: HealIcon, addable: false },
] as const satisfies readonly EffectKind[];

/** Effects that start from defaults; a LUT layer needs its table first. */
export type DefaultEffect = Exclude<EffectLayer["kind"], "lut">;

export function createLayer<K extends DefaultEffect>(
  kind: K,
): Extract<EffectLayer, { kind: K }>;
export function createLayer(kind: DefaultEffect): EffectLayer {
  const name = effectKinds.find((entry) => entry.kind === kind)?.label ?? kind;
  const base = { ...baseLayer(), name };
  switch (kind) {
    case "details":
      return { ...base, kind, details: { ...defaultDetails } };
    case "exposure":
      return { ...base, kind, exposure: 1 };
    case "vignette":
      return { ...base, kind, vignette: { ...defaultVignette, intensity: 50 } };
    case "grain":
      return { ...base, kind, grain: { ...defaultGrain, amount: 25 } };
    case "color-mixer":
      return { ...base, kind, colorMixer: defaultMixer };
    case "fill":
      return { ...base, kind, fill: { ...defaultFill } };
    case "heal":
      return { ...base, kind, patches: [] };
  }
}

/** Keeps a table read from `file` with the document and adds a layer named after it; returns the layer's ID. */
export function addLut(
  document: EditorDocument,
  file: File,
  table: LookupTable,
  placement?: LayerPlacement,
) {
  // An open group commits first: releasing it would drop a table no layer uses yet.
  document.history.commit();
  const lut = document.resources.addLut(file, table);
  const layer: ProcessingLayer = {
    ...baseLayer(),
    kind: "lut",
    name: table.name,
    lut,
  };
  return addLayer(document, layer, placement);
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
    case "grain":
      return layer.grain.amount === 0;
    case "color-mixer":
      return isNeutral(layer.colorMixer);
    case "fill":
    case "lut":
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

/** Convenience commands address the first root effect of a kind or create one on top of the stack as one entry; returns the layer edited. */
export function editEffect(
  document: EditorDocument,
  kind: DefaultEffect,
  id: string | undefined,
  edit: (id: string) => void,
) {
  const scene = document.scene.getState();
  const existing = id ?? findEffect(scene.layers, kind)?.id;
  if (existing) {
    edit(existing);
    return existing;
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
  return layer.id;
}
