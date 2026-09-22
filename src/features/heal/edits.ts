import {
  type BrushStroke,
  type EditorDocument,
  editLayer,
  type HealPatch,
  type Layer,
  type StrokePoint,
} from "@/core/document";
import { validPoints } from "@/core/document/brush";
import type { Point } from "@/core/image/frame";
import {
  validateOffset,
  validatePatchBlend,
  validatePatchStroke,
} from "./model";

export function addHealPatch(
  document: EditorDocument,
  id: string,
  stroke: BrushStroke,
  offset: Point,
) {
  validatePatchStroke(stroke);
  validateOffset(offset);
  const patch: HealPatch = {
    id: crypto.randomUUID(),
    feather: stroke.feather,
    stroke: { ...structuredClone(stroke), feather: 0 },
    opacity: 1,
    offset: [offset[0], offset[1]],
  };
  editLayer(document, id, (layer) => ({
    ...layer,
    patches: [...healPatches(layer), patch],
  }));
  return patch.id;
}

function healPatches(layer: Layer) {
  if (layer.kind !== "heal") throw Error("Select a Healing layer.");
  return layer.patches;
}

/** Rewrites the patch list around one patch, found by id. */
function editPatches(
  document: EditorDocument,
  id: string,
  patchId: string,
  edit: (patches: readonly HealPatch[], index: number) => readonly HealPatch[],
) {
  editLayer(document, id, (layer) => {
    const patches = healPatches(layer);
    const index = patches.findIndex((patch) => patch.id === patchId);
    if (index < 0) throw Error("Heal patch is unavailable.");
    return { ...layer, patches: edit(patches, index) };
  });
}

/** Edits one patch's blend; its shape and donor stay as painted. */
export function setHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
  change: { feather?: number; opacity?: number },
) {
  validatePatchBlend(change);
  editPatches(document, id, patchId, (patches, index) =>
    patches.with(index, {
      ...patches[index],
      feather: change.feather ?? patches[index].feather,
      opacity: change.opacity ?? patches[index].opacity,
    }),
  );
}

export function duplicateHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
) {
  const nextId = crypto.randomUUID();
  editPatches(document, id, patchId, (patches, index) =>
    patches.toSpliced(index + 1, 0, {
      ...structuredClone(patches[index]),
      id: nextId,
    }),
  );
  return nextId;
}

export function deleteHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
) {
  editPatches(document, id, patchId, (patches, index) =>
    patches.toSpliced(index, 1),
  );
}

export function extendHealPatch(
  document: EditorDocument,
  id: string,
  points: readonly StrokePoint[],
) {
  if (!validPoints(points)) {
    throw Error(
      "Stroke points need finite coordinates and pressure from 0 to 1.",
    );
  }
  editLayer(document, id, (layer) => {
    if (layer.kind !== "heal" || !layer.patches.length) {
      throw Error("Start a heal patch before extending it.");
    }
    return {
      ...layer,
      patches: layer.patches.map((patch, index) =>
        index === layer.patches.length - 1
          ? {
              ...patch,
              stroke: {
                ...patch.stroke,
                points: [...patch.stroke.points, ...points],
              },
            }
          : patch,
      ),
    };
  });
}

export function setHealSource(
  document: EditorDocument,
  id: string,
  patchId: string,
  offset: Point,
) {
  validateOffset(offset);
  editPatches(document, id, patchId, (patches, index) =>
    patches.with(index, { ...patches[index], offset: [offset[0], offset[1]] }),
  );
}

/** Moves a patch while its donor stays fixed. */
export function setHealDestination(
  document: EditorDocument,
  id: string,
  patchId: string,
  destination: Point,
) {
  validateOffset(destination);
  editPatches(document, id, patchId, (patches, index) => {
    const patch = patches[index];
    const [x, y] = patch.stroke.points[0];
    const delta: Point = [destination[0] - x, destination[1] - y];
    return patches.with(index, {
      ...patch,
      stroke: {
        ...patch.stroke,
        points: patch.stroke.points.map(
          ([x, y, pressure]) => [x + delta[0], y + delta[1], pressure] as const,
        ),
      },
      offset: [patch.offset[0] - delta[0], patch.offset[1] - delta[1]],
    });
  });
}
