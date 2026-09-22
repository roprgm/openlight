import {
  type BrushStroke,
  type EditorDocument,
  editLayer,
  findLayer,
  type HealAlgorithm,
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
      throw Error("Select a Heal layer.");
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

/** Edits one patch's blend and marks later generated input as stale. */
export function setHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
  change: PatchChange,
) {
  if (
    change.feather !== undefined &&
    (!Number.isFinite(change.feather) ||
      change.feather < 0 ||
      change.feather > 1)
  ) {
    throw Error("Heal patch feather must be between 0 and 1.");
  }
  if (
    change.opacity !== undefined &&
    (!Number.isFinite(change.opacity) ||
      change.opacity < 0 ||
      change.opacity > 1)
  ) {
    throw Error("Heal patch opacity must be between 0 and 1.");
  }
  editLayer(document, id, (layer) => {
    if (layer.kind !== "heal") throw Error("Select a Healing layer.");
    const current = layer.patches.find((patch) => patch.id === patchId);
    if (!current) throw Error("Heal patch is unavailable.");
    const index = layer.patches.findIndex((patch) => patch.id === patchId);
    const patches = layer.patches.map((patch) =>
      patch.id === patchId
        ? {
            ...patch,
            feather: change.feather ?? patch.feather,
            opacity: change.opacity ?? patch.opacity,
          }
        : patch,
    );
    return {
      ...layer,
      patches: invalidateGeneratedResults(patches, index + 1),
    };
  });
}

export function duplicateHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
) {
  const nextId = crypto.randomUUID();
  editLayer(document, id, (layer) => {
    if (layer.kind !== "heal") throw Error("Select a Healing layer.");
    const index = layer.patches.findIndex((patch) => patch.id === patchId);
    if (index < 0) throw Error("Heal patch is unavailable.");
    const patches = [...layer.patches];
    patches.splice(index + 1, 0, {
      ...structuredClone(patches[index]),
      id: nextId,
    });
    return {
      ...layer,
      patches: invalidateGeneratedResults(patches, index + 1),
    };
  });
  return nextId;
}

export function deleteHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
) {
  editLayer(document, id, (layer) => {
    if (layer.kind !== "heal") throw Error("Select a Healing layer.");
    if (!layer.patches.some((patch) => patch.id === patchId)) {
      throw Error("Heal patch is unavailable.");
    }
    const index = layer.patches.findIndex((patch) => patch.id === patchId);
    const patches = layer.patches.filter((patch) => patch.id !== patchId);
    return {
      ...layer,
      patches: invalidateGeneratedResults(patches, index),
    };
  });
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

function healSourceScene(
  document: EditorDocument,
  id: string,
  patchId: string,
  offset: Point,
) {
  validateOffset(offset);
  return updateLayer(document.scene.getState(), id, (layer) => {
    if (
      layer.kind !== "heal" ||
      !layer.patches.some(
        (patch) => patch.id === patchId && patch.algorithm === "clone",
      )
    ) {
      throw Error("Heal patch is unavailable.");
    }
    const index = layer.patches.findIndex((patch) => patch.id === patchId);
    const patches = layer.patches.map((patch) =>
      patch.id === patchId
        ? { ...patch, offset: [offset[0], offset[1]] as Point }
        : patch,
    );
    return {
      ...layer,
      patches: invalidateGeneratedResults(patches, index + 1),
    };
  });
}

export function setHealSource(
  document: EditorDocument,
  id: string,
  patchId: string,
  offset: Point,
) {
  document.edit(healSourceScene(document, id, patchId, offset));
}

/** Writes a donor into the open stroke, or into the committed stroke when that gesture already closed. */
export function finishHealSource(
  document: EditorDocument,
  id: string,
  patchId: string,
  offset: Point,
) {
  const next = healSourceScene(document, id, patchId, offset);
  if (document.history.status.getState().editing) document.edit(next);
  else document.history.amend(next);
}

/** Drops an automatic stroke that never received its donor or AI result. */
export function discardPendingHealPatch(
  document: EditorDocument,
  id: string,
  patchId: string,
  automatic: boolean,
) {
  const scene = document.scene.getState();
  const layer = findLayer(scene.layers, id);
  if (layer?.kind !== "heal") return;
  const patch = layer.patches.find((item) => item.id === patchId);
  if (!patch) return;
  const unfinished =
    (patch.algorithm === "ai" && !patch.result) ||
    (automatic &&
      patch.algorithm === "clone" &&
      patch.offset[0] === 0 &&
      patch.offset[1] === 0);
  if (!unfinished) return;
  const index = layer.patches.findIndex((item) => item.id === patchId);
  const next = updateLayer(scene, id, (item) => {
    if (item.kind !== "heal") return item;
    return {
      ...item,
      patches: invalidateGeneratedResults(
        item.patches.filter((entry) => entry.id !== patchId),
        index,
      ),
    };
  });
  if (document.history.status.getState().editing) document.edit(next);
  else document.history.amend(next);
}

/** Moves a patch while its Smart clone donor and existing AI result stay fixed. */
export function setHealDestination(
  document: EditorDocument,
  id: string,
  patchId: string,
  destination: Point,
) {
  validateOffset(destination);
  editLayer(document, id, (layer) => {
    if (layer.kind !== "heal") throw Error("Select a Healing layer.");
    const current = layer.patches.find((patch) => patch.id === patchId);
    if (!current) throw Error("Heal patch is unavailable.");
    const first = current.stroke.points[0];
    const delta: Point = [destination[0] - first[0], destination[1] - first[1]];
    const stroke = {
      ...current.stroke,
      points: current.stroke.points.map(
        ([x, y, pressure]) => [x + delta[0], y + delta[1], pressure] as const,
      ),
    };
    const moved =
      current.algorithm === "clone"
        ? {
            ...current,
            stroke,
            offset: [
              current.offset[0] - delta[0],
              current.offset[1] - delta[1],
            ] as Point,
          }
        : { ...current, stroke };
    const index = layer.patches.findIndex((patch) => patch.id === patchId);
    const patches = layer.patches.map((patch) =>
      patch.id === patchId ? moved : patch,
    );
    return {
      ...layer,
      patches: invalidateGeneratedResults(
        patches,
        current.algorithm === "ai" ? index : index + 1,
      ),
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
    if (layer.kind !== "heal") throw Error("Select a Healing layer.");
    return {
      ...layer,
      patches: layer.patches.map((patch) => {
        if (patch.id !== patchId || patch.algorithm !== "ai") return patch;
        const { stale: _, ...current } = patch;
        return { ...current, result };
      }),
    };
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

/** Stores a generated result in the open stroke, or amends it when that gesture already closed. */
export function finishAiResult(
  document: EditorDocument,
  id: string,
  patchId: string,
  result: AiResult,
) {
  if (document.history.status.getState().editing) {
    setAiResult(document, id, patchId, result);
  } else {
    settleAiResult(document, id, patchId, result);
  }
}
