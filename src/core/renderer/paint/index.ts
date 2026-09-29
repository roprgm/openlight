import type { Gpu, Target } from "vgpu";
import {
  hasPaint,
  type Painting,
  type PaintLayer,
  type PaintStroke,
} from "@/core/document";
import { input, type RenderInput } from "@/core/renderer/node";
import { createRasterCache } from "@/core/renderer/raster-cache";
import {
  extendsStrokes,
  type Rect,
  type Stroke,
  type Strokes,
} from "@/core/renderer/strokes";
import { readRaster, writeRaster } from "./transfer";

type Size = readonly [number, number];

/**
 * Paintings keep half the photo's resolution each way, a quarter of its pixels, which the passes that
 * read them sample back to full size by position. A stroke can't set a single photo pixel, which
 * photos rarely want of paint or masks, and each raster takes a quarter of the memory.
 */
export function paintingSize([width, height]: Size): Size {
  return [Math.ceil(width / 2), Math.ceil(height / 2)];
}

/** Raster pixels per photo pixel on each axis. */
function paintingScale(source: Size): Size {
  const [width, height] = paintingSize(source);
  return [width / source[0], height / source[1]];
}

/** One painting's raster: its settled pixels, if any, and strokes over them. */
type Raster = {
  target: Target;
  /** The settled pixels the raster starts from. */
  base?: string;
  strokes: readonly Stroke[];
  /** Dabs already stamped from the last stroke. */
  dabs: number;
};
const none: readonly Stroke[] = [];

/** A paint layer's raster, and its open stroke, which the stroke buffer holds, to lay over it. */
export type PaintInput = {
  raster: RenderInput;
  /** The stroke buffer, or the raster again while no stroke of the layer is open. */
  buffer: RenderInput;
  stroke?: PaintStroke;
};

/** Whether a raster holds `base` and strokes that only grow into `strokes`. */
function holds(
  raster: Raster | undefined,
  { raster: base, strokes }: Painting,
) {
  return (
    raster !== undefined &&
    raster.base === base &&
    (raster.strokes === strokes || extendsStrokes(raster.strokes, strokes))
  );
}

export type PaintRaster = ReturnType<typeof createPaintRaster>;

/**
 * Rasterizes paintings at half the photo's resolution, premultiplied color for paint layers and coverage for
 * brush masks: settled pixels, loaded first, and strokes drawn over them through the stroke buffer. A
 * raster comes with its painting's first stroke or pixels and stays, cleared if need be, while the
 * painting lasts, so painting and undoing never reallocate it.
 */
export function createPaintRaster(
  gpu: Gpu,
  strokes: Strokes,
  format: "rgba8unorm" | "r8unorm",
) {
  const rasters = createRasterCache<Raster>(
    gpu,
    format,
    (target) => ({ target, strokes: none, dabs: 0 }),
    (raster) => strokes.discard(raster.target),
  );
  return {
    get: (id: string) => rasters.get(id)?.target,
    get size() {
      return rasters.size;
    },
    /** Whether a painting's raster must load its settled pixels before it can draw the strokes. */
    needsBase(
      id: string,
      painting: Painting,
    ): painting is Painting & { raster: string } {
      return painting.raster !== undefined && !holds(rasters.get(id), painting);
    },
    /** Loads a painting's settled pixels; the next draw lays its strokes over them. `source` is the photo's size. */
    async loadBase(id: string, base: string, pixels: Blob, source: Size) {
      const raster = rasters.reserve(id, paintingSize(source));
      strokes.discard(raster.target);
      await writeRaster(gpu, raster.target, pixels);
      Object.assign(raster, { base, strokes: none, dabs: 0 });
    },
    /**
     * Brings a painting's raster up to date once its settled pixels loaded, and returns it, with whether
     * its last stroke opened now and where the stroke buffer changed; nothing without paint. `source` is
     * the photo's size.
     */
    draw(
      id: string,
      painting: Painting,
      source: Size,
    ): { target: Target; opened: boolean; changed?: Rect } | undefined {
      if (!hasPaint(painting) && !rasters.get(id)) {
        return undefined;
      }
      const raster = rasters.reserve(id, paintingSize(source));
      const { target } = raster;
      if (!holds(raster, painting)) {
        if (painting.raster !== undefined) {
          throw Error("Load the painting's settled pixels first.");
        }
        strokes.discard(target);
        strokes.clear(target);
        Object.assign(raster, { base: undefined, strokes: none, dabs: 0 });
      }
      if (raster.strokes === painting.strokes) {
        return { target, opened: false };
      }
      const drawn = raster.strokes.length;
      const { dabs, ...changes } = strokes.draw(
        target,
        painting.strokes,
        Math.max(drawn - 1, 0),
        drawn ? raster.dabs : 0,
        paintingScale(source),
      );
      Object.assign(raster, { strokes: painting.strokes, dabs });
      return { target, ...changes };
    },
    /** What a paint layer composes. Read it once every layer drew: drawing one can close another's stroke. */
    input(layer: PaintLayer): PaintInput | undefined {
      const target = rasters.get(layer.id)?.target;
      if (!target || !hasPaint(layer)) {
        return undefined;
      }
      const open = strokes.isOpen(target);
      return {
        raster: input(target),
        buffer: input((open && strokes.buffer()) || target),
        stroke: open ? layer.strokes.at(-1) : undefined,
      };
    },
    /**
     * Reads a painting's raster, its settled pixels with every stroke laid in, so they settle into new
     * pixels; `commit` records that the raster now holds them alone. Nothing may draw meanwhile.
     */
    async settle(id: string) {
      const raster = rasters.get(id);
      if (!raster) {
        return undefined;
      }
      if (strokes.isOpen(raster.target)) {
        strokes.close();
      }
      const { base, strokes: settled } = raster;
      const pixels = await readRaster(gpu, raster.target);
      return {
        base,
        strokes: settled,
        pixels,
        commit(base: string) {
          Object.assign(raster, { base, strokes: none, dabs: 0 });
        },
      };
    },
    sweep: rasters.sweep,
    inspect: () => rasters.inspect(),
    dispose: rasters.dispose,
  };
}
