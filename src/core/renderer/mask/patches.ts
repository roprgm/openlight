import type { Gpu, Target } from "vgpu";
import type { BrushStroke } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { input, type RenderInput } from "@/core/renderer/node";
import { createRasterCache } from "@/core/renderer/raster-cache";
import { extendsStrokes, type Strokes } from "@/core/renderer/strokes";
import type { DabWalk } from "@/core/renderer/strokes/dabs";

type Size = readonly [number, number];
/** Rasters cover whole tiles, so one follows a growing stroke without reallocating at every move. */
const tile = 256;

type Patch = {
  target: Target;
  origin: Point;
  strokes?: readonly BrushStroke[];
  /** Where the stroke's dabs stopped, to go on from there as it grows. */
  walk?: DabWalk;
};

/** A patch's coverage and where it sits in the photo, in source pixels. */
export type PatchInput = { coverage: RenderInput; origin: Point };

/** The tiles a stroke's dabs reach, within the photo. */
function strokeTiles(strokes: readonly BrushStroke[], [width, height]: Size) {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (const stroke of strokes) {
    if (stroke.mode === "erase") continue;
    const radius = stroke.size / 2 + 1;
    for (const [x, y] of stroke.points) {
      left = Math.min(left, x - radius);
      top = Math.min(top, y - radius);
      right = Math.max(right, x + radius);
      bottom = Math.max(bottom, y + radius);
    }
  }
  const snap = (value: number, round: (value: number) => number, end: number) =>
    Math.min(end, Math.max(0, round(value / tile) * tile));
  left = snap(left, Math.floor, width);
  top = snap(top, Math.floor, height);
  right = snap(right, Math.ceil, width);
  bottom = snap(bottom, Math.ceil, height);
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
    patch(id: string, painted: readonly BrushStroke[], size: Size): PatchInput {
      const tiles = strokeTiles(painted, size);
      const patch = patches.reserve(id, tiles.size);
      const moved =
        patch.origin[0] !== tiles.origin[0] ||
        patch.origin[1] !== tiles.origin[1];
      if (moved || !patch.strokes || !extendsStrokes(patch.strokes, painted)) {
        strokes.clear(patch.target);
        Object.assign(patch, {
          origin: tiles.origin,
          strokes: undefined,
          walk: undefined,
        });
      }
      if (patch.strokes !== painted) {
        const from = Math.max(0, (patch.strokes?.length ?? 0) - 1);
        for (let i = from; i < painted.length; i++) {
          patch.walk = strokes.stamp(
            patch.target,
            painted[i],
            i === from ? patch.walk : undefined,
            patch.origin,
          );
        }
        patch.strokes = painted;
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
