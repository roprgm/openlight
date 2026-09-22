import {
  type BrushStroke,
  type EditorDocument,
  editLayer,
  type HealAlgorithm,
  type HealPatch,
  type Layer,
  type StrokePoint,
  updateLayer,
} from "@/core/document";
import { validateStroke, validPoints } from "@/core/document/brush";
import type { Point } from "@/core/image/frame";
import { invalidateGeneratedResults, validateOffset } from "./model";

export function addHealPatch(
  document: EditorDocument,
  id: string,
  stroke: BrushStroke,
  offset: Point,
  algorithm: HealAlgorithm = "clone",
) {
  validateStroke(stroke);
  if (stroke.mode !== "paint") {
    throw Error("Heal patches use painted strokes.");
  }
  if (algorithm !== "clone" && algorithm !== "ai") {
    throw Error("Choose Smart clone or AI Remove for a heal patch.");
  }
  const base = {
    id: crypto.randomUUID(),
    feather: stroke.feather,
    stroke: { ...structuredClone(stroke), feather: 0 },
    opacity: 1,
  };
  if (algorithm === "clone") validateOffset(offset);
  const patch =
    algorithm === "clone"
      ? { ...base, algorithm, offset: structuredClone(offset) }
      : { ...base, algorithm };
  editLayer(document, id, (layer) => {
    if (layer.kind !== "heal") {
      throw Error("Select a Healing layer.");
    }
    return { ...layer, patches: [...layer.patches, patch] };
  });
  return patch.id;
}

type PatchChange = {
  feather?: number;
  opacity?: number;
};

type AiResult = {
  source: string;
  origin: Point;
  extent: Point;
};

function healPatches(layer: Layer) {
  if (layer.kind !== "heal") throw Error("Select a Healing layer.");
  return layer.patches;
}

function indexOf(patches: readonly HealPatch[], patchId: string) {
  const index = patches.findIndex((patch) => patch.id === patchId);
  if (index < 0) throw Error("Heal patch is unavailable.");
  return index;
}

/** Rewrites the patches around one patch. Generated results from `stale` onward regenerate afterwards. */
function editPatches(
  document: EditorDocument,
  id: string,
  patchId: string,
  edit: (
    patches: readonly HealPatch[],
    index: number,
  ) => { patches: readonly HealPatch[]; stale: number },
) {
  editLayer(document, id, (layer) => {
    const current = healPatches(layer);
    const { patches, stale } = edit(current, indexOf(current, patchId));
    return { ...layer, patches: invalidateGeneratedResults(patches, stale) };
  });
}

function unit(name: string, value: number | undefined) {
  if (value !== undefined && !(value >= 0 && value <= 1)) {
    throw Error(`Heal patch ${name} must be between 0 and 1.`);
  }
}

/** Edits one patch's blend and marks later generated input as stale. */
export function setHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
  change: PatchChange,
) {
  unit("feather", change.feather);
  unit("opacity", change.opacity);
  editPatches(document, id, patchId, (patches, index) => ({
    patches: patches.with(index, {
      ...patches[index],
      feather: change.feather ?? patches[index].feather,
      opacity: change.opacity ?? patches[index].opacity,
    }),
    stale: index + 1,
  }));
}

export function duplicateHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
) {
  const nextId = crypto.randomUUID();
  editPatches(document, id, patchId, (patches, index) => ({
    patches: patches.toSpliced(index + 1, 0, {
      ...structuredClone(patches[index]),
      id: nextId,
    }),
    stale: index + 1,
  }));
  return nextId;
}

export function deleteHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
) {
  editPatches(document, id, patchId, (patches, index) => ({
    patches: patches.toSpliced(index, 1),
    stale: index,
  }));
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
  editPatches(document, id, patchId, (patches, index) => {
    const patch = patches[index];
    if (patch.algorithm !== "clone")
      throw Error("Heal patch is not Smart clone.");
    return {
      patches: patches.with(index, {
        ...patch,
        offset: [offset[0], offset[1]],
      }),
      stale: index + 1,
    };
  });
}

/** Moves a patch while its Smart clone donor and existing AI result stay fixed. */
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
    const stroke = {
      ...patch.stroke,
      points: patch.stroke.points.map(
        ([x, y, pressure]) => [x + delta[0], y + delta[1], pressure] as const,
      ),
    };
    if (patch.algorithm === "ai") {
      return {
        patches: patches.with(index, { ...patch, stroke }),
        stale: index,
      };
    }
    const offset: Point = [
      patch.offset[0] - delta[0],
      patch.offset[1] - delta[1],
    ];
    return {
      patches: patches.with(index, { ...patch, stroke, offset }),
      stale: index + 1,
    };
  });
}

function aiResult(
  document: EditorDocument,
  id: string,
  patchId: string,
  result: AiResult,
) {
  return updateLayer(document.scene.getState(), id, (layer) => {
    const patches = healPatches(layer);
    const index = indexOf(patches, patchId);
    const current = patches[index];
    if (current.algorithm !== "ai") throw Error("Heal patch is not AI Remove.");
    const { stale: _, ...patch } = current;
    return { ...layer, patches: patches.with(index, { ...patch, result }) };
  });
}
export function setAiResult(
  document: EditorDocument,
  id: string,
  patchId: string,
  result: AiResult,
) {
  document.edit(aiResult(document, id, patchId, result));
}

/** Settles regenerated content into the edit that made it stale. */
export function settleAiResult(
  document: EditorDocument,
  id: string,
  patchId: string,
  result: AiResult,
) {
  document.history.amend(aiResult(document, id, patchId, result));
}
