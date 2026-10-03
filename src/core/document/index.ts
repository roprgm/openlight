import { createStore } from "zustand/vanilla";
import { validateFrame } from "@/core/image/frame";
import { createHistory } from "./history";
import {
  createResources,
  type FieldRecord,
  type RemoveField,
} from "./resources";
import type { Mask, MaskModifier, Scene } from "./scene";
import { findLayer, paintingOf, removePatches, walkLayers } from "./tree";

export type { FieldRecord, RemoveField } from "./resources";
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

type Resources = ReturnType<typeof createResources>;

/** A Remove field and, while it waits to be synthesized, the fields it extends, up to a synthesized one. */
function fieldChain(resources: Resources, id: string) {
  const ids = [id];
  let record = resources.field(id);
  while (record && !record.field && record.base) {
    ids.push(record.base);
    record = resources.field(record.base);
  }
  return ids;
}

/**
 * The resources a scene names: its image source, the pixels its paintings settled into, and its
 * Remove fields with the fields they extend.
 */
function resourceIds(scene: Scene, resources: Resources) {
  const ids = [scene.layers[0].source];
  for (const { layer } of walkLayers(scene.layers)) {
    const raster = paintingOf(layer)?.raster;
    if (raster) {
      ids.push(raster);
    }
  }
  for (const { patch } of removePatches(scene.layers)) {
    ids.push(...fieldChain(resources, patch.field));
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

/** The Remove fields `scene` names, with the fields those still waiting extend, taken now like `settledPixels`. */
export function fieldRecords(
  document: EditorDocument,
  scene = document.scene.getState(),
) {
  const records = new Map<string, FieldRecord>();
  for (const { patch } of removePatches(scene.layers)) {
    for (const id of fieldChain(document.resources, patch.field)) {
      records.set(id, document.resources.field(id) ?? {});
    }
  }
  return records;
}

/**
 * `records` taken for a snapshot, with the fields the editor shows but they still waited for read back
 * since; rejects when a readback fails.
 */
export async function completeFields(
  document: EditorDocument,
  records: ReadonlyMap<string, FieldRecord>,
) {
  const waiting = [...records]
    .filter(([, record]) => !record.field)
    .map(([id]) => id);
  const captured = await document.captureFields(waiting);
  return new Map(
    [...records].map(([id, record]): [string, FieldRecord] => {
      const field = record.field ?? captured.get(id);
      return [id, field ? { field } : record];
    }),
  );
}

/** Reads back the Remove fields among `ids` the editor holds but resources wait for. */
type FieldCapture = (
  ids: readonly string[],
) => Promise<ReadonlyMap<string, RemoveField>>;

/** One independent editing session. No React, decoders, or file workflows. */
export function createDocument(initial: Scene, resources = createResources()) {
  const scene = createStore(() => initial);
  const selection = createStore(() => ({ layerId: initial.layers[0].id }));
  const { update, replace, ...history } = createHistory(
    scene,
    equal,
    100,
    (retained) => {
      resources.retain(
        new Set(retained.flatMap((scene) => resourceIds(scene, resources))),
      );
    },
  );
  const unsubscribe = scene.subscribe((state) => {
    const id = selection.getState().layerId;
    if (!findLayer(state.layers, id)) {
      selection.setState({ layerId: state.layers[0].id });
    }
  });
  let capture: FieldCapture | undefined;
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
    /** Sets how the editor reads back the Remove fields it shows, for `captureFields`. Returns its removal. */
    onCaptureFields(next: FieldCapture) {
      capture = next;
      return () => {
        if (capture === next) {
          capture = undefined;
        }
      };
    },
    /**
     * The fields among `ids` that the editor shows but resources still wait for, read back once the
     * syntheses in flight finish, so a snapshot holds what the editor shows; rejects when a readback fails.
     */
    async captureFields(
      ids: readonly string[],
    ): Promise<ReadonlyMap<string, RemoveField>> {
      return (await capture?.(ids)) ?? new Map();
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
