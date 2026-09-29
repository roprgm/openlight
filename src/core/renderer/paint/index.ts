import type { Gpu, Target } from "vgpu";
import { hasPaint, type PaintLayer, type PaintStroke } from "@/core/document";
import { input, type RenderInput } from "@/core/renderer/node";
import { createRasterCache } from "@/core/renderer/raster-cache";
import { extendsStrokes, type Strokes } from "@/core/renderer/strokes";
import { readRaster, writeRaster } from "./transfer";

type Size = readonly [number, number];
/** One paint layer's premultiplied color: its settled pixels, if any, and strokes over them. */
type Paint = {
  target: Target;
  /** The settled pixels the raster starts from. */
  base?: string;
  strokes: readonly PaintStroke[];
  /** Dabs already stamped from the last stroke. */
  dabs: number;
};
const none: readonly PaintStroke[] = [];

/** A paint layer's raster, and its open stroke, which the stroke buffer holds, to lay over it. */
export type PaintInput = {
  raster: RenderInput;
  buffer: RenderInput;
  stroke?: PaintStroke;
};

/** Whether a paint raster holds `base` and strokes that only grow into `strokes`. */
function holds(
  paint: Paint | undefined,
  base: string | undefined,
  strokes: readonly PaintStroke[],
) {
  return (
    paint !== undefined &&
    paint.base === base &&
    (paint.strokes === strokes || extendsStrokes(paint.strokes, strokes))
  );
}

/**
 * Rasterizes paint layers into premultiplied rgba8unorm textures at source resolution: settled pixels,
 * loaded first, and strokes drawn over them through the stroke buffer. A raster comes with its layer's
 * first paint and stays, cleared if need be, while the layer lasts, so painting and undoing never
 * reallocate it.
 */
export function createPaintRaster(gpu: Gpu, strokes: Strokes) {
  const paints = createRasterCache<Paint>(
    gpu,
    "rgba8unorm",
    (target) => ({ target, strokes: none, dabs: 0 }),
    (paint) => strokes.discard(paint.target),
  );
  return {
    /** Whether a paint layer's raster must load its settled pixels before it can draw the layer's strokes. */
    needsBase(layer: PaintLayer): layer is PaintLayer & { raster: string } {
      return (
        layer.raster !== undefined &&
        !holds(paints.get(layer.id), layer.raster, layer.strokes)
      );
    },
    /** Loads a paint layer's settled pixels; the next draw lays its strokes over them. */
    async loadBase(id: string, base: string, pixels: Blob, size: Size) {
      const paint = paints.reserve(id, size);
      strokes.discard(paint.target);
      await writeRaster(gpu, paint.target, pixels);
      Object.assign(paint, { base, strokes: none, dabs: 0 });
    },
    /** Brings a paint layer's raster up to date, once its settled pixels loaded. */
    draw(layer: PaintLayer, size: Size) {
      const { id, raster: base, strokes: list } = layer;
      if (!hasPaint(layer) && !paints.get(id)) {
        return;
      }
      // The layer's composition binds the stroke buffer, open stroke or not.
      strokes.reserve(size);
      const paint = paints.reserve(id, size);
      if (!holds(paint, base, list)) {
        if (base !== undefined) {
          throw Error("Load the paint's settled pixels first.");
        }
        strokes.discard(paint.target);
        strokes.clear(paint.target);
        Object.assign(paint, { base, strokes: none, dabs: 0 });
      }
      if (paint.strokes !== list) {
        const drawn = paint.strokes.length;
        paint.dabs = strokes.draw(
          paint.target,
          list,
          Math.max(drawn - 1, 0),
          drawn ? paint.dabs : 0,
        ).dabs;
        paint.strokes = list;
      }
    },
    /** What a paint layer composes. Read it once every layer drew: drawing one can close another's stroke. */
    input(layer: PaintLayer): PaintInput | undefined {
      const paint = paints.get(layer.id);
      const buffer = strokes.buffer();
      if (!paint || !buffer || !hasPaint(layer)) {
        return undefined;
      }
      return {
        raster: input(paint.target),
        buffer: input(buffer),
        stroke: strokes.isOpen(paint.target) ? paint.strokes.at(-1) : undefined,
      };
    },
    /** A paint layer's raster, for tests that check it stays. */
    raster: (id: string) => paints.get(id)?.target,
    /**
     * Reads a paint layer's raster, its settled pixels with every stroke laid in, so they settle into new
     * pixels; `commit` records that the raster now holds them alone. Nothing may draw meanwhile.
     */
    async settle(id: string) {
      const paint = paints.get(id);
      if (!paint) {
        return undefined;
      }
      if (strokes.isOpen(paint.target)) {
        strokes.close();
      }
      const { base, strokes: settled } = paint;
      const pixels = await readRaster(gpu, paint.target);
      return {
        base,
        strokes: settled,
        pixels,
        commit(base: string) {
          Object.assign(paint, { base, strokes: none, dabs: 0 });
        },
      };
    },
    sweep: paints.sweep,
    inspect: () => paints.inspect(),
    dispose: paints.dispose,
  };
}
