import type { Gpu, Target } from "vgpu";
import type { BrushStroke } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { input, type RenderInput } from "@/core/renderer/node";
import { createRasterCache } from "@/core/renderer/raster-cache";
import { extendsStroke, type Strokes } from "@/core/renderer/strokes";
import type { DabWalk } from "@/core/renderer/strokes/dabs";

type Size = readonly [number, number];
/** Rasters cover whole tiles, so one follows a growing stroke without reallocating at every move. */
const tile = 256;

type Patch = {
  target: Target;
  origin: Point;
  stroke?: BrushStroke;
  /** Where the stroke's dabs stopped, to go on from there as it grows. */
  walk?: DabWalk;
};

/** A patch's coverage and where it sits in the photo, in source pixels. */
export type PatchInput = { coverage: RenderInput; origin: Point };

/** The tiles a stroke's dabs reach, within the photo. */
function strokeTiles(stroke: BrushStroke, [width, height]: Size) {
  const radius = stroke.size / 2 + 1;
  const xs = stroke.points.map(([x]) => x);
  const ys = stroke.points.map(([, y]) => y);
  const snap = (value: number, round: (value: number) => number, end: number) =>
    Math.min(end, Math.max(0, round(value / tile) * tile));
  const left = snap(Math.min(...xs) - radius, Math.floor, width);
  const top = snap(Math.min(...ys) - radius, Math.floor, height);
  const right = snap(Math.max(...xs) + radius, Math.ceil, width);
  const bottom = snap(Math.max(...ys) + radius, Math.ceil, height);
  return {
    origin: [left, top] as Point,
    size: [Math.max(1, right - left), Math.max(1, bottom - top)] as const,
  };
}

/**
 * Rasterizes the hard strokes of Healing patches into r8unorm textures over only the tiles they reach,
 * since a layer holds any number of patches. A stroke at full flow rounds the same either way, so it
 * stamps straight into its raster, and a patch still growing stamps only its new dabs.
 */
export function createPatchRaster(gpu: Gpu, strokes: Strokes) {
  const patches = createRasterCache<Patch>(gpu, "r8unorm", (target) => ({
    target,
    origin: [0, 0],
  }));
  return {
    patch(id: string, stroke: BrushStroke, size: Size): PatchInput {
      const tiles = strokeTiles(stroke, size);
      const patch = patches.reserve(id, tiles.size);
      const moved =
        patch.origin[0] !== tiles.origin[0] ||
        patch.origin[1] !== tiles.origin[1];
      if (moved || !patch.stroke || !extendsStroke(patch.stroke, stroke)) {
        strokes.clear(patch.target);
        Object.assign(patch, {
          origin: tiles.origin,
          stroke: undefined,
          walk: undefined,
        });
      }
      if (patch.stroke !== stroke) {
        patch.walk = strokes.stamp(
          patch.target,
          stroke,
          patch.walk,
          patch.origin,
        );
        patch.stroke = stroke;
      }
      return { coverage: input(patch.target), origin: patch.origin };
    },
    /** A patch's raster and where it sits in the photo, for its thumbnail. */
    raster: (id: string) => patches.get(id),
    sweep: patches.sweep,
    inspect: () => patches.inspect(),
    dispose: patches.dispose,
  };
}
