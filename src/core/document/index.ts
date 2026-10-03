import { createStore } from "zustand/vanilla";
import { validateFrame } from "@/core/image/frame";
import { createHistory } from "./history";
import { createResources } from "./resources";
import type { Mask, MaskModifier, Scene } from "./scene";
import { findLayer, paintingOf, removePatches, walkLayers } from "./tree";

export type {
  Adjustments,
  Blend,
  BrushMask,
  BrushStroke,
  ColorMixer,
  ColorRange,
  CurvePoint,
  Details,
  EffectLayer,
  Fill,
  Gradient,
  Grain,
  HealMode,
  HealPatch,
  ImageLayer,
  Layer,
  LinearGradient,
  LookupTable,
  LuminanceRange,
  Mask,
  MaskLayer,
  MaskModifier,
  Painting,
  PaintLayer,
  PaintStroke,
  ProcessingLayer,
  RadialGradient,
  RangeMask,
  RemoveField,
  RemovePatch,
  Scene,
  StrokePoint,
  ToneCurve,
  Vignette,
} from "./scene";
export {
  adjustmentTarget,
  editLayer,
  findLayer,
  hasPaint,
  isRangeMask,
  locateLayer,
  maskModifiers,
  paintingOf,
  removePatches,
  updateLayer,
  walkLayers,
} from "./tree";
export { createResources };

export type Preview = {
  comparison: "edited" | "original" | "split";
  split: number;
  shadows: boolean;
  highlights: boolean;
  /** The mask whose coverage the display tints red; a layer ID lets the display use its rasterized coverage. */
  maskOverlay?: {
    readonly mask: Mask;
    readonly modifiers: readonly MaskModifier[];
    readonly layerId?: string;
    /** The layer's opacity, which scales the tint like it scales the effect. */
    readonly opacity?: number;
  };
  /** The mask whose ranges' image, the one below it, renders keep while a color is picked from it. */
  rangeSource?: string;
};

/** Scenes contain only plain values; unchanged branches keep their identity. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false;
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        equal(Reflect.get(a, key), Reflect.get(b, key)),
    )
  );
}

/**
 * The resources a scene names: its image source, the pixels its paintings settled into, and its
 * Remove fields.
 */
function resourceIds(scene: Scene) {
  const ids = [scene.layers[0].source];
  for (const { layer } of walkLayers(scene.layers)) {
    const raster = paintingOf(layer)?.raster;
    if (raster) {
      ids.push(raster);
    }
  }
  for (const { patch } of removePatches(scene.layers)) {
    if (patch.field) {
      ids.push(patch.field.texels);
    }
  }
  return ids;
}

/** The settled pixels `scene` names, taken now, so work that may outlive the document still has them. */
export function settledPixels(
  document: EditorDocument,
  scene = document.scene.getState(),
) {
  const pixels = new Map<string, Blob>();
  for (const { layer } of walkLayers(scene.layers)) {
    const raster = paintingOf(layer)?.raster;
    if (raster) {
      pixels.set(raster, document.resources.paint(raster));
    }
  }
  return pixels;
}

/** The Remove fields `scene` names, taken now, like `settledPixels`. */
export function fieldTexels(
  document: EditorDocument,
  scene = document.scene.getState(),
) {
  const texels = new Map<string, Blob>();
  for (const { patch } of removePatches(scene.layers)) {
    if (patch.field) {
      texels.set(
        patch.field.texels,
        document.resources.field(patch.field.texels),
      );
    }
  }
  return texels;
}

/** One independent editing session. No React, decoders, or file workflows. */
export function createDocument(initial: Scene, resources = createResources()) {
  const scene = createStore(() => initial);
  const selection = createStore(() => ({ layerId: initial.layers[0].id }));
  const { update, replace, ...history } = createHistory(
    scene,
    equal,
    100,
    (retained) => {
      resources.retain(new Set(retained.flatMap(resourceIds)));
    },
  );
  const unsubscribe = scene.subscribe((state) => {
    const id = selection.getState().layerId;
    if (!findLayer(state.layers, id)) {
      selection.setState({ layerId: state.layers[0].id });
    }
  });
  const inFlight = new Set<Promise<unknown>>();
  let closed = false;
  return {
    id: crypto.randomUUID(),
    scene: {
      getState: scene.getState,
      getInitialState: scene.getInitialState,
      subscribe: scene.subscribe,
    },
    selection,
    selectLayer(layerId: string) {
      const state = scene.getState();
      if (!findLayer(state.layers, layerId)) {
        throw Error("Layer is unavailable.");
      }
      if (selection.getState().layerId !== layerId) {
        history.commit();
        selection.setState({ layerId });
      }
    },
    preview: createStore<Preview>(() => ({
      comparison: "edited",
      split: 0.5,
      shadows: false,
      highlights: false,
    })),
    history,
    resources,
    edit(next: Scene) {
      if (closed) {
        throw new Error("Document is closed.");
      }
      validateFrame(next.frame);
      update(next);
    },
    /**
     * Replaces the current scene in place, for a change that shows nothing new, such as paint strokes
     * settling into pixels; history stays as it was.
     */
    replace(next: Scene) {
      if (closed) {
        throw new Error("Document is closed.");
      }
      replace(next);
    },
    /** Keeps `work` that will replace the scene in place, such as a Remove field read back, for `replaced`. */
    replacing(work: Promise<unknown>) {
      inFlight.add(work);
      const done = () => inFlight.delete(work);
      void work.then(done, done);
    },
    /**
     * Resolves once in-place replacements in flight finish, so a snapshot holds what the editor shows,
     * and rejects when one fails, since the snapshot would lack it.
     */
    async replaced() {
      while (inFlight.size) {
        await Promise.all(inFlight);
      }
    },
    /** Whether the document was disposed, so work that outlived it can drop its result. */
    get closed() {
      return closed;
    },
    dispose() {
      if (closed) {
        return;
      }
      closed = true;
      unsubscribe();
      history.clear();
      resources.dispose();
    },
  };
}

export type EditorDocument = ReturnType<typeof createDocument>;
