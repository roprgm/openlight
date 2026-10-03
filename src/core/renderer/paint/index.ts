import { type Gpu, type Target, target } from "vgpu";
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
import type { DabWalk } from "@/core/renderer/strokes/dabs";
import { readRaster, writeRaster } from "@/core/renderer/transfer";

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
  /** Where the last stroke's dabs stopped, to go on from there as it grows. */
  walk?: DabWalk;
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

/** Pixels and the stroke prefix they replace, accepted only while the painting still has that prefix. */
type SettledPainting = {
  base?: string;
  strokes: readonly Stroke[];
  pixels: Blob;
};
export type AcceptPainting = (settled: SettledPainting) => string | undefined;
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
  // Coverage readers need the open stroke laid over its raster; paint composes the two separately.
  let view: Target | undefined;
  function show(brush: Target, changed?: Rect) {
    const [width, height] = brush.size;
    if (view && (view.size[0] !== width || view.size[1] !== height)) {
      view.color.dispose();
      view = undefined;
    }
    view ??= target(gpu, {
      size: [width, height],
      format: "r8unorm",
      clearColor: [0, 0, 0, 0],
    });
    strokes.resolve(view, brush, changed ?? [0, 0, width, height]);
  }
  const rasters = createRasterCache<Raster>(
    gpu,
    format,
    (target) => ({ target, strokes: none }),
    (raster) => strokes.discard(raster.target),
  );
  return {
    get: (id: string) => rasters.get(id)?.target,
    /** Coverage with the latest stroke laid over it, read after every painting drew. */
    coverage(id: string) {
      const raster = rasters.get(id)?.target;
      return raster && input(view && strokes.isOpen(raster) ? view : raster);
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
      Object.assign(raster, { base, strokes: none, walk: undefined });
    },
    /**
     * Brings a painting's raster and coverage view up to date once its settled pixels loaded.
     * `source` is the photo's size.
     */
    draw(id: string, painting: Painting, source: Size) {
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
        Object.assign(raster, {
          base: undefined,
          strokes: none,
          walk: undefined,
        });
      }
      if (raster.strokes === painting.strokes) {
        return;
      }
      const drawn = raster.strokes.length;
      const { walk, opened, changed } = strokes.draw(
        target,
        painting.strokes,
        Math.max(drawn - 1, 0),
        drawn ? raster.walk : undefined,
        paintingScale(source),
      );
      Object.assign(raster, { strokes: painting.strokes, walk });
      if (
        format === "r8unorm" &&
        strokes.isOpen(target) &&
        (opened || changed)
      ) {
        show(target, opened ? undefined : changed);
      }
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
     * pixels. Accepting them replaces the scene's stroke prefix and records its new raster base together.
     * Nothing may draw until both finish.
     */
    async settle(id: string, accept: AcceptPainting) {
      const raster = rasters.get(id);
      if (!raster?.strokes.length) {
        return false;
      }
      if (strokes.isOpen(raster.target)) {
        strokes.close();
      }
      const { base, strokes: settled } = raster;
      const pixels = await readRaster(gpu, raster.target);
      const accepted = accept({ base, strokes: settled, pixels });
      if (accepted === undefined) {
        return false;
      }
      Object.assign(raster, { base: accepted, strokes: none, walk: undefined });
      return true;
    },
    sweep() {
      rasters.sweep();
      if (!rasters.size) {
        view?.color.dispose();
        view = undefined;
      }
    },
    inspect: () => [
      ...rasters.inspect(),
      ...(view
        ? [{ id: "stroke view", size: [...view.size], format: view.format }]
        : []),
    ],
    dispose() {
      rasters.dispose();
      view?.color.dispose();
      view = undefined;
    },
  };
}
