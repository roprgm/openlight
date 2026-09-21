import { createStore } from "zustand/vanilla";
import { validateFrame } from "@/core/image/frame";
import { createHistory } from "./history";
import { createResources } from "./resources";
import type { Gradient, MaskModifier, Scene } from "./scene";
import { findLayer } from "./tree";

export type {
  Adjustments,
  ColorMixer,
  CurvePoint,
  Details,
  EffectLayer,
  Gradient,
  ImageLayer,
  Layer,
  LinearGradient,
  MaskLayer,
  MaskModifier,
  ProcessingLayer,
  RadialGradient,
  Scene,
  ToneCurve,
  Vignette,
} from "./scene";
export {
  adjustmentTarget,
  editLayer,
  findLayer,
  locateLayer,
  maskModifiers,
  updateLayer,
  walkLayers,
} from "./tree";
export { createResources };

export type Preview = {
  comparison: "edited" | "original" | "split";
  split: number;
  shadows: boolean;
  highlights: boolean;
  /** The mask whose coverage the display tints red. */
  maskOverlay?: {
    readonly mask: Gradient;
    readonly modifiers: readonly MaskModifier[];
  };
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

/** One independent editing session. No React, decoders, or file workflows. */
export function createDocument(initial: Scene, resources = createResources()) {
  const scene = createStore(() => initial);
  const selection = createStore(() => ({ layerId: initial.layers[0].id }));
  const { update, ...history } = createHistory(
    scene,
    equal,
    100,
    (retained) => {
      resources.retain(
        new Set(retained.map((state) => state.layers[0].source)),
      );
    },
  );
  const unsubscribe = scene.subscribe((state) => {
    const id = selection.getState().layerId;
    if (!findLayer(state.layers, id)) {
      selection.setState({ layerId: state.layers[0].id });
    }
  });
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
