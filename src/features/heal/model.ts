import type { BrushStroke, HealPatch } from "@/core/document";
import type { Point } from "@/core/image/frame";

function invalidateGeneratedResult(patch: HealPatch): HealPatch {
  switch (patch.algorithm) {
    case "clone":
      return patch;
    case "ai": {
      if (!patch.result) return patch;
      return { ...patch, stale: true };
    }
  }
}

/** Invalidates generated patches whose inputs changed during ordered replay. */
export function invalidateGeneratedResults(
  patches: readonly HealPatch[],
  from: number,
) {
  return [
    ...patches.slice(0, from),
    ...patches.slice(from).map(invalidateGeneratedResult),
  ];
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

export function validateOffset(offset: Point) {
  if (offset.length !== 2 || !offset.every(Number.isFinite)) {
    throw Error("A heal source needs two finite source-pixel offsets.");
  }
}

/** Square neural context around the painted object, clamped to the document. */
export function miganBounds(stroke: BrushStroke, size: readonly number[]) {
  const bounds = patchBounds(stroke, size);
  const side = Math.min(
    Math.min(...size),
    Math.ceil(Math.max(512, bounds.extent[0] * 2, bounds.extent[1] * 2)),
  );
  return {
    origin: [
      Math.round(
        Math.max(
          0,
          Math.min(
            size[0] - side,
            bounds.origin[0] + bounds.extent[0] / 2 - side / 2,
          ),
        ),
      ),
      Math.round(
        Math.max(
          0,
          Math.min(
            size[1] - side,
            bounds.origin[1] + bounds.extent[1] / 2 - side / 2,
          ),
        ),
      ),
    ] as Point,
    extent: [side, side] as Point,
  };
}
