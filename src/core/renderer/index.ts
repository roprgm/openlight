import type { Gpu, Target, Timer } from "vgpu";
import {
  type BrushStroke,
  type MaskLayer,
  type PaintLayer,
  type Scene,
  walkLayers,
} from "@/core/document";
import type { ImageSource, WhiteBalance } from "@/core/image";
import { createRenderGraph } from "./graph";
import { createMaskRaster, type PaintInput } from "./mask";
import { input, type RenderImage, type RenderInput } from "./node";
import { createProxy } from "./proxy";

export { maskInput, mixAdjustment } from "./blend";
export {
  type Clipping,
  type CoverageRegion,
  createDisplay,
  type MaskOverlay,
  renderBitmap,
  renderCoverage,
  type View,
} from "./display";
export type { PaintInput } from "./mask";
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
  /** Keep one stable composition instance and its render-graph resources reusable. */
  retain: (id: string) => void;
  /** Rasterized coverage of a mask that paints with brushes, prepared before composition. */
  coverage: (layer: MaskLayer) => RenderInput | undefined;
  /** Rasterized paint of a paint layer, prepared before composition. */
  paint: (layer: PaintLayer) => PaintInput | undefined;
  brush: (id: string, strokes: readonly BrushStroke[]) => RenderInput;
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

/**
 * Owns scene passes, mask and paint rasters, the proxy, and intermediate textures for one decoded
 * source. `paintPixels` gives the settled pixels a paint layer's `raster` names.
 */
export function createRenderer(
  gpu: Gpu,
  resource: ImageSource,
  compose: SceneProcessing,
  timer?: Timer,
  paintPixels: (id: string) => Blob = () => {
    throw Error("This renderer has no settled paint.");
  },
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
  /** A paint raster being read to settle, which nothing may draw into meanwhile. */
  let settling: Promise<unknown> | undefined;
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
    const active = new Set<string>();
    const developed = raw?.render() ?? source;
    // Every mask and paint layer updates once, bypassed or not, so a hidden one keeps its raster; child masks only shape their parent's coverage.
    const rasters = new Map<string, RenderInput | undefined>();
    for (const { layer, parent } of walkLayers(scene.layers)) {
      if (layer.kind === "mask" && parent?.kind !== "mask") {
        rasters.set(layer.id, raster.update(layer, developed.size));
      }
      if (layer.kind === "paint") {
        raster.draw(layer, developed.size);
      }
    }
    const image =
      factor > 1 ? proxy.render(developed, factor, version) : input(developed);
    const images = compose(image, scene, {
      inputId,
      retain: (id) => active.add(id),
      coverage: (layer) => rasters.get(layer.id),
      paint: (layer) => raster.paint(layer),
      brush: (id, strokes) => raster.brush(id, strokes, developed.size),
    });
    for (const id of instances) {
      if (!active.has(id)) graph.release(`${id}/`);
    }
    instances = active;
    raster.sweep();
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
  /** Paint layers whose rasters must load settled pixels before they draw. */
  function stalePaint(scene: Scene) {
    const stale = [];
    for (const { layer } of walkLayers(scene.layers)) {
      if (layer.kind === "paint" && raster.needsBase(layer)) {
        stale.push(layer);
      }
    }
    return stale;
  }
  /**
   * Renders the latest request once what it waits for is ready: a settle, a RAW development, whose
   * calibration alone crosses the worker, or settled paint to load.
   */
  async function develop() {
    while (next && !disposed) {
      const request = next;
      next = undefined;
      const { scene } = request;
      if (settling) {
        await settling;
      }
      const selected = scene.layers[0].whiteBalance ?? resource.raw?.asShot;
      if (raw && selected && !sameBalance(balance, selected)) {
        await raw.prepare(selected);
        if (disposed) {
          return;
        }
        balance = selected;
        version++;
      }
      for (const layer of stalePaint(scene)) {
        const pixels = paintPixels(layer.raster);
        await raster.loadBase(layer.id, layer.raster, pixels, source.size);
        if (disposed) {
          return;
        }
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
    // Renders wait, in order, for a settle, a RAW development, or settled paint to load.
    if (!raw && !pending && !settling && !stalePaint(scene).length) {
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
    /**
     * Reads a paint layer's raster once renders in flight finish, holding back the next ones, so its
     * strokes can settle into pixels; see the mask raster's `settle`.
     */
    async settle(id: string) {
      while (pending || settling) {
        await (pending ?? settling);
      }
      const read = raster.settle(id);
      settling = read;
      try {
        return await read;
      } finally {
        settling = undefined;
      }
    },
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
