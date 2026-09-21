import {
  type BrushStroke,
  type EditorDocument,
  editLayer,
  type HealAlgorithm,
  type StrokePoint,
} from "@/core/document";
import { validateStroke, validPoints } from "@/core/document/brush";
import type { Point } from "@/core/image/frame";
import { validateOffset } from "./model";

export function addHealPatch(
  document: EditorDocument,
  id: string,
  stroke: BrushStroke,
  offset: Point,
  algorithm: HealAlgorithm = "healing",
) {
  validateStroke(stroke);
  if (stroke.mode !== "paint") {
    throw Error("Heal patches use painted strokes.");
  }
  const base = {
    id: crypto.randomUUID(),
    feather: stroke.feather,
    stroke: { ...structuredClone(stroke), feather: 0 },
    opacity: 1,
  };
  if (algorithm === "healing") validateOffset(offset);
  const patch =
    algorithm === "healing"
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

/** Edits the visible shape of one patch without regenerating its donor or AI result. */
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
    return {
      ...layer,
      patches: layer.patches.map((patch) =>
        patch.id === patchId
          ? {
              ...patch,
              feather: change.feather ?? patch.feather,
              opacity: change.opacity ?? patch.opacity,
            }
          : patch,
      ),
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
    return { ...layer, patches };
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
    return {
      ...layer,
      patches: layer.patches.filter((patch) => patch.id !== patchId),
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

export function setHealSource(
  document: EditorDocument,
  id: string,
  patchId: string,
  offset: Point,
) {
  validateOffset(offset);
  editLayer(document, id, (layer) => {
    if (
      layer.kind !== "heal" ||
      !layer.patches.some(
        (patch) => patch.id === patchId && patch.algorithm === "healing",
      )
    ) {
      throw Error("Heal patch is unavailable.");
    }
    return {
      ...layer,
      patches: layer.patches.map((patch) =>
        patch.id === patchId
          ? { ...patch, offset: [offset[0], offset[1]] }
          : patch,
      ),
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
      current.algorithm === "healing"
        ? {
            ...current,
            stroke,
            offset: [
              current.offset[0] - delta[0],
              current.offset[1] - delta[1],
            ] as Point,
          }
        : { ...current, stroke };
    return {
      ...layer,
      patches: layer.patches.map((patch) =>
        patch.id === patchId ? moved : patch,
      ),
    };
  });
}

export function setAiResult(
  document: EditorDocument,
  id: string,
  patchId: string,
  result: string,
  origin: Point,
  extent: Point,
) {
  editLayer(document, id, (layer) => {
    if (layer.kind !== "heal") throw Error("Select a Healing layer.");
    return {
      ...layer,
      patches: layer.patches.map((patch) =>
        patch.id === patchId && patch.algorithm === "ai"
          ? { ...patch, result: { source: result, origin, extent } }
          : patch,
      ),
    };
  });
}
