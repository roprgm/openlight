import {
  type BrushStroke,
  type EditorDocument,
  editLayer,
  type HealMode,
  type HealPatch,
  type Layer,
  type StrokePoint,
} from "@/core/document";
import { strokePoints, strokeSchema } from "@/core/document/brush";
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
    strokes: [{ ...painted, feather: 0, flow: 1 }],
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
    strokes: [{ ...painted, feather: 0, flow: 1 }],
    opacity: 1,
    field: document.resources.reserveField(),
  };
  editLayer(document, id, (layer) => ({
    ...layer,
    patches: [...healPatches(layer), patch],
  }));
  return patch.id;
}

/** A patch with new strokes; a Remove patch takes a new field, which extends its earlier one. */
function withStrokes(
  document: EditorDocument,
  patch: HealPatch,
  strokes: readonly BrushStroke[],
): HealPatch {
  if (patch.mode !== "remove") {
    return { ...patch, strokes };
  }
  const field = document.resources.reserveField(patch.field);
  return { ...patch, strokes, field };
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

/**
 * Adds or subtracts a separate stroke without changing the patch's donor or blend. A Remove patch takes
 * a new field, which extends its earlier one.
 */
export function addHealStroke(
  document: EditorDocument,
  id: string,
  patchId: string,
  stroke: BrushStroke,
) {
  const painted = parse(strokeSchema, stroke, "Invalid heal stroke");
  editPatches(document, id, patchId, (patches, index) =>
    patches.with(
      index,
      withStrokes(document, patches[index], [
        ...patches[index].strokes,
        { ...painted, feather: 0, flow: 1 },
      ]),
    ),
  );
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
    const patch = layer.patches[layer.patches.length - 1];
    const last = patch.strokes[patch.strokes.length - 1];
    const strokes = patch.strokes.with(-1, {
      ...last,
      points: [...last.points, ...added],
    });
    return {
      ...layer,
      patches: layer.patches.with(-1, withStrokes(document, patch, strokes)),
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

/** Moves a patch; a Heal/Clone donor stays fixed, and a Remove patch synthesizes its new place. */
export function setHealDestination(
  document: EditorDocument,
  id: string,
  patchId: string,
  destination: Point,
) {
  const [targetX, targetY] = parse(point, destination, "Invalid heal target");
  editPatches(document, id, patchId, (patches, index) => {
    const patch = patches[index];
    const [x, y] = patch.strokes[0].points[0];
    const delta: Point = [targetX - x, targetY - y];
    const strokes = patch.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map(
        ([x, y, pressure]) => [x + delta[0], y + delta[1], pressure] as const,
      ),
    }));
    if (patch.mode === "remove") {
      // A patch in a new place keeps nothing it filled.
      const field = document.resources.reserveField();
      return patches.with(index, { ...patch, strokes, field });
    }
    return patches.with(index, {
      ...patch,
      strokes,
      offset: [patch.offset[0] - delta[0], patch.offset[1] - delta[1]],
    });
  });
}
