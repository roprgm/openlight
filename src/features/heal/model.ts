import { z } from "zod";
import {
  type BrushStroke,
  findLayer,
  type HealPatch,
  type Scene,
} from "@/core/document";
import { strokeSchema } from "@/core/document/brush";
import type { Point } from "@/core/image/frame";
import { point, unit } from "@/lib/parse";

export function findHealPatch(scene: Scene, layerId: string, patchId: string) {
  const layer = findLayer(scene.layers, layerId);
  if (layer?.kind !== "heal") return;
  return layer.patches.find((patch) => patch.id === patchId);
}

/** Whether a dab reaches the image at all; a stroke starting further away has nothing to repair. */
export function dabTouchesImage(
  [x, y]: readonly number[],
  radius: number,
  size: readonly number[],
) {
  return (
    x + radius > 0 &&
    y + radius > 0 &&
    x - radius < size[0] &&
    y - radius < size[1]
  );
}

/** Bounds include the whole soft brush edge, with room for a known boundary. */
export function patchBounds(
  stroke: BrushStroke,
  size: readonly number[],
  margin = 0,
) {
  const radius = stroke.size / 2 + margin + 4;
  let left = size[0];
  let top = size[1];
  let right = 0;
  let bottom = 0;
  for (const [x, y] of stroke.points) {
    left = Math.min(left, x - radius);
    top = Math.min(top, y - radius);
    right = Math.max(right, x + radius);
    bottom = Math.max(bottom, y + radius);
  }
  const origin: Point = [
    Math.max(0, Math.floor(left)),
    Math.max(0, Math.floor(top)),
  ];
  const extent: Point = [
    Math.max(1, Math.min(size[0], Math.ceil(right)) - origin[0]),
    Math.max(1, Math.min(size[1], Math.ceil(bottom)) - origin[1]),
  ];
  return { origin, extent };
}

/** A square around the patch with a little margin, so a thumbnail keeps the stroke's proportions. */
export function patchThumbnailRegion(
  stroke: BrushStroke,
  size: readonly number[],
): { origin: Point; extent: Point } {
  const { origin, extent } = patchBounds(stroke, size);
  const side = Math.max(extent[0], extent[1]) * 1.1;
  return {
    origin: [
      origin[0] + (extent[0] - side) / 2,
      origin[1] + (extent[1] - side) / 2,
    ],
    extent: [side, side],
  };
}

export const patchStroke = strokeSchema.refine(
  (stroke) => stroke.mode === "paint",
  "Heal patches use painted strokes",
);

export const patchBlend = z.strictObject({
  feather: unit.optional(),
  opacity: unit.optional(),
});

export const healPatchSchema = z.object({
  id: z.string().min(1),
  feather: unit,
  stroke: patchStroke,
  opacity: unit,
  offset: point,
}) satisfies z.ZodType<HealPatch>;
