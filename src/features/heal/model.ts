import type { BrushStroke, HealPatch, Scene } from "@/core/document";
import type { Point } from "@/core/image/frame";

export function findHealPatch(scene: Scene, layerId: string, patchId: string) {
  const layer = scene.layers.find((layer) => layer.id === layerId);
  if (layer?.kind !== "heal") return;
  return layer.patches.find((patch) => patch.id === patchId);
}

/** Marks generated patches whose input changed during ordered replay, including one still generating. */
export function invalidateGeneratedResults(
  patches: readonly HealPatch[],
  from: number,
) {
  return [
    ...patches.slice(0, from),
    ...patches
      .slice(from)
      .map((patch) =>
        patch.algorithm === "ai" ? { ...patch, stale: true as const } : patch,
      ),
  ];
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
) {
  const { origin, extent } = patchBounds(stroke, size);
  const side = Math.max(extent[0], extent[1]) * 1.1;
  return {
    origin: [
      origin[0] + (extent[0] - side) / 2,
      origin[1] + (extent[1] - side) / 2,
    ] as Point,
    extent: [side, side] as Point,
  };
}

export function validateOffset(offset: Point) {
  if (offset.length !== 2 || !offset.every(Number.isFinite)) {
    throw Error("A heal source needs two finite source-pixel offsets.");
  }
}

/** Context around the patch: a square when the image allows one, otherwise as much of each axis as fits, so a long stroke keeps its ends and its surroundings. */
export function miganBounds(stroke: BrushStroke, size: readonly number[]) {
  const bounds = patchBounds(stroke, size);
  const side = Math.ceil(
    Math.max(512, bounds.extent[0] * 2, bounds.extent[1] * 2),
  );
  const axis = (index: number) => {
    const extent = Math.min(size[index], Math.max(side, bounds.extent[index]));
    const centre = bounds.origin[index] + bounds.extent[index] / 2;
    const origin = Math.round(
      Math.max(0, Math.min(size[index] - extent, centre - extent / 2)),
    );
    return [origin, extent] as const;
  };
  const [x, width] = axis(0);
  const [y, height] = axis(1);
  return { origin: [x, y] as Point, extent: [width, height] as Point };
}
