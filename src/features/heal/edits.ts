import {
  type BrushStroke,
  type EditorDocument,
  editLayer,
  type HealMode,
  type HealPatch,
  type Layer,
  type StrokePoint,
} from "@/core/document";
import { strokePoints } from "@/core/document/brush";
import type { Point } from "@/core/image/frame";
import { parse, point } from "@/lib/parse";
import { donorModeSchema, patchBlend, patchStroke } from "./model";

function healPatches(layer: Layer) {
  if (layer.kind !== "heal") throw Error("Select a Healing layer.");
  return layer.patches;
}

export function addHealPatch(
  document: EditorDocument,
  id: string,
  stroke: BrushStroke,
  offset: Point,
  mode: Exclude<HealMode, "remove"> = "heal",
) {
  const painted = parse(patchStroke, stroke, "Invalid heal stroke");
  const patch: HealPatch = {
    id: crypto.randomUUID(),
    mode: parse(donorModeSchema, mode, "Invalid heal mode"),
    feather: painted.feather,
    stroke: { ...painted, feather: 0 },
    opacity: 1,
    offset: parse(point, offset, "Invalid heal source"),
  };
  editLayer(document, id, (layer) => ({
    ...layer,
    patches: [...healPatches(layer), patch],
  }));
  return patch.id;
}

export function addRemovePatch(
  document: EditorDocument,
  id: string,
  stroke: BrushStroke,
) {
  const painted = parse(patchStroke, stroke, "Invalid remove stroke");
  const patch: HealPatch = {
    id: crypto.randomUUID(),
    mode: "remove",
    feather: painted.feather,
    stroke: { ...painted, feather: 0 },
    opacity: 1,
  };
  editLayer(document, id, (layer) => ({
    ...layer,
    patches: [...healPatches(layer), patch],
  }));
  return patch.id;
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

/** Edits the blend while preserving the recorded repair geometry. */
export function setHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
  change: { feather?: number; opacity?: number },
) {
  const blend = parse(patchBlend, change, "Invalid heal patch");
  editPatches(document, id, patchId, (patches, index) =>
    patches.with(index, {
      ...patches[index],
      feather: blend.feather ?? patches[index].feather,
      opacity: blend.opacity ?? patches[index].opacity,
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
  const added = parse(strokePoints, points, "Invalid stroke points");
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
                points: [...patch.stroke.points, ...added],
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
  const source = parse(point, offset, "Invalid heal source");
  editPatches(document, id, patchId, (patches, index) => {
    const patch = patches[index];
    if (patch.mode === "remove") throw Error("Remove patches have no donor.");
    return patches.with(index, { ...patch, offset: source });
  });
}

/** Moves a patch; a Heal/Clone donor stays fixed. */
export function setHealDestination(
  document: EditorDocument,
  id: string,
  patchId: string,
  destination: Point,
) {
  const [targetX, targetY] = parse(point, destination, "Invalid heal target");
  editPatches(document, id, patchId, (patches, index) => {
    const patch = patches[index];
    const [x, y] = patch.stroke.points[0];
    const delta: Point = [targetX - x, targetY - y];
    const moved = {
      ...patch,
      stroke: {
        ...patch.stroke,
        points: patch.stroke.points.map(
          ([x, y, pressure]) => [x + delta[0], y + delta[1], pressure] as const,
        ),
      },
    };
    if (patch.mode === "remove") return patches.with(index, moved);
    return patches.with(index, {
      ...moved,
      mode: patch.mode,
      offset: [patch.offset[0] - delta[0], patch.offset[1] - delta[1]],
    });
  });
}
