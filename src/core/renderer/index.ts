import type { Gpu, Target, Timer } from "vgpu";
import {
  type Layer,
  type MaskLayer,
  type Scene,
  walkLayers,
} from "@/core/document";
import type { ImageSource, WhiteBalance } from "@/core/image";
import { createRenderGraph } from "./graph";
import { createMaskRaster } from "./mask";
import { input, type RenderImage, type RenderInput } from "./node";
import { createProxy } from "./proxy";

export { maskInput, mixAdjustment } from "./blend";
export {
  type Clipping,
  createDisplay,
  type MaskOverlay,
  renderBitmap,
  renderCoverage,
  type View,
} from "./display";
export {
  input,
  merge,
  type NodeDefinition,
  node,
  pipeline,
  type RenderImage,
  type RenderInput,
  type RenderNode,
  type RenderStep,
  type Scale,
  sourceSize,
  split,
} from "./node";
export { transformImages } from "./transform";
export { createRenderGraph };

export type Composition = {
  inputId?: string;
  /** Rasterized coverage of a mask that paints with brushes, prepared before composition. */
  coverage: (layer: MaskLayer) => RenderInput | undefined;
};

/** App composition describes requested outputs; the engine owns their storage. */
export type SceneProcessing = (
  source: RenderImage,
  scene: Scene,
  composition: Composition,
) => {
  original: RenderImage;
  full: RenderImage;
  output: RenderImage;
  input?: RenderImage;
};

type RenderRequest = {
  scene: Scene;
  inputId?: string;
  /** Source pixels per texel of the composition's source; above 1 renders a reduced proxy. */
  factor: number;
};

function sameBalance(a: WhiteBalance | undefined, b: WhiteBalance | undefined) {
  return a?.temperature === b?.temperature && a?.tint === b?.tint;
}

/** Owns scene passes, mask rasters, the proxy, and intermediate textures for one decoded source. */
export function createRenderer(
  gpu: Gpu,
  resource: ImageSource,
  compose: SceneProcessing,
  timer?: Timer,
) {
  const source = resource.image;
  const graph = createRenderGraph(gpu, timer);
  const raster = createMaskRaster(gpu);
  const proxy = createProxy(gpu);
  const release = resource.retain();
  const raw = resource.raw?.createPass();
  let original = source;
  let full = source;
  const listeners = new Set<() => void>();
  let rendered = false;
  let output = source;
  let inspected: { id: string; image: Target } | undefined;
  let balance = resource.raw?.asShot;
  /** Counts developments, so the proxy follows white-balance changes. */
  let version = 0;
  let displayScale = 1;
  let last: RenderRequest | undefined;
  let next: RenderRequest | undefined;
  let pending: Promise<void> | undefined;
  let disposed = false;
  let instances = new Set<string>();
  function render(request: RenderRequest) {
    const { scene, inputId, factor } = request;
    if (
      last &&
      last.scene === scene &&
      last.inputId === inputId &&
      last.factor === factor
    ) {
      return;
    }
    const active = new Set(walkLayers(scene.layers).map((layer) => layer.id));
    for (const id of instances) {
      if (!active.has(id)) {
        graph.release(`layer/${id}/`);
      }
    }
    instances = active;
    const developed = raw?.render() ?? source;
    // A mask updates its rasters with those of the masks inside it, which only shape its coverage.
    function prepare(layer: Layer, parent?: Layer) {
      if (layer.kind === "mask" && parent?.kind !== "mask") {
        raster.update(layer, developed.size);
      }
      for (const child of layer.children) {
        prepare(child, layer);
      }
    }
    for (const layer of scene.layers) {
      prepare(layer);
    }
    raster.sweep();
    const image =
      factor > 1 ? proxy.render(developed, factor, version) : input(developed);
    const images = compose(image, scene, {
      inputId,
      coverage: (layer) => raster.get(layer.id),
    });
    const targets = graph.render([
      images.original,
      images.full,
      images.output,
      ...(images.input ? [images.input] : []),
    ]);
    [original, full, output] = targets;
    inspected =
      inputId && targets[3] ? { id: inputId, image: targets[3] } : undefined;
    rendered = true;
    last = request;
    for (const listener of listeners) {
      listener();
    }
  }
  /** Only calibration crosses the worker; each renderer owns its GPU RAW pass. */
  async function develop() {
    while (next && !disposed) {
      const request = next;
      next = undefined;
      const { scene } = request;
      const selected = scene.layers[0].whiteBalance ?? resource.raw?.asShot;
      if (raw && selected && !sameBalance(balance, selected)) {
        await raw.prepare(selected);
        if (disposed) {
          return;
        }
        balance = selected;
        version++;
      }
      if (!next) {
        render(request);
      }
    }
  }
  /** Interactive updates render at a proxy resolution matched to the display scale. */
  async function update(
    scene: Scene,
    inputId?: string,
    interactive = false,
  ): Promise<void> {
    if (disposed) {
      throw Error("Renderer is closed.");
    }
    const factor = interactive ? Math.max(1, Math.floor(1 / displayScale)) : 1;
    if (!resource.raw) {
      render({ scene, inputId, factor });
      return;
    }
    next = { scene, inputId, factor };
    pending ??= develop()
      .catch((error) => {
        if (!next) {
          throw error;
        }
      })
      .finally(() => {
        pending = undefined;
        if (next && !disposed) {
          return update(next.scene, next.inputId, next.factor > 1);
        }
      });
    return pending;
  }

  return {
    originalImage: () => original,
    fullImage: () => full,
    outputImage: () => output,
    inputImage: (id: string) =>
      inspected?.id === id ? inspected.image : undefined,
    /** The rasterized coverage of a mask layer, for the display overlay. */
    coverage: (id: string) => raster.get(id)?.target,
    /** Device pixels shown per source pixel; interactive renders reduce the source to about this density. */
    setDisplayScale(scale: number) {
      if (Number.isFinite(scale) && scale > 0) {
        displayScale = scale;
      }
    },
    inspect: () => ({ ...graph.inspect(), ...raster.inspect() }),
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (rendered) {
        listener();
      }
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      listeners.clear();
      graph.dispose();
      raster.dispose();
      proxy.dispose();
      raw?.dispose();
      release();
    },
  };
}
