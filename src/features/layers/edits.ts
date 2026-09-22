import {
  type BrushStroke,
  type EditorDocument,
  editLayer,
  findLayer,
  type Layer,
  locateLayer,
  type Mask,
  type MaskLayer,
  type ProcessingLayer,
  type Scene,
  type StrokePoint,
  updateLayer,
  walkLayers,
} from "@/core/document";
import { strokePoints, strokeSchema } from "@/core/document/brush";
import { parse } from "@/lib/parse";
import { layerSettings, maskOperation, maskSchema } from "./model";

function processingLayer(document: EditorDocument, id: string) {
  const layer = findLayer(document.scene.getState().layers, id);
  if (!layer || layer.kind === "image") {
    throw Error("Processing layer is unavailable.");
  }
  return layer;
}

function changeChildren(
  scene: Scene,
  parentId: string | undefined,
  change: (layers: readonly ProcessingLayer[]) => readonly ProcessingLayer[],
): Scene {
  const [image, ...layers] = scene.layers;
  if (!parentId) {
    return { ...scene, layers: [image, ...change(layers)] };
  }
  if (parentId === image.id) {
    throw Error("The image layer cannot contain layers.");
  }
  return updateLayer(scene, parentId, (layer) => ({
    ...layer,
    children: change(layer.children),
  }));
}

export function validateDepth(layers: readonly Layer[]) {
  if (
    layers.some((layer) =>
      layer.children.some((child) => child.children.length > 0),
    )
  ) {
    throw Error("Layers support two levels: a parent and its children.");
  }
}

/** Above a sibling, inside a processing layer, or on top of the root stack. */
export type LayerPlacement = { above: string } | { inside: string };

function placementIndex(
  scene: Scene,
  placement?: LayerPlacement,
): { parentId?: string; index?: number } {
  if (placement === undefined) {
    return {};
  }
  if (typeof placement !== "object" || placement === null) {
    throw Error("Invalid layer placement.");
  }
  if ("inside" in placement) {
    return { parentId: placement.inside };
  }
  const location = locateLayer(scene.layers, placement.above);
  if (!location) {
    throw Error("Layer is unavailable.");
  }
  const index =
    location.siblings.findIndex((item) => item.id === location.layer.id) +
    (location.parent ? 1 : 0);
  return { parentId: location.parent?.id, index };
}

/** Structural commands commit an open gesture and record one entry each. */
export function addLayer(
  document: EditorDocument,
  layer: ProcessingLayer,
  placement?: LayerPlacement,
) {
  const scene = document.scene.getState();
  const existing = new Set(
    Array.from(walkLayers(scene.layers), (item) => item.layer.id),
  );
  for (const item of walkLayers([layer])) {
    if (existing.has(item.layer.id)) {
      throw Error("Layer IDs must be unique.");
    }
    existing.add(item.layer.id);
  }
  const { parentId, index } = placementIndex(scene, placement);
  const next = changeChildren(scene, parentId, (layers) =>
    layers.toSpliced(index ?? layers.length, 0, layer),
  );
  validateDepth(next.layers);
  document.history.commit();
  document.edit(next);
  document.selectLayer(layer.id);
  return layer.id;
}

const settingsChange = layerSettings.partial().strict();

export function setLayer(
  document: EditorDocument,
  id: string,
  change: Partial<Pick<ProcessingLayer, "visible" | "opacity" | "name">>,
) {
  const settings = parse(settingsChange, change, "Invalid layer settings");
  processingLayer(document, id);
  editLayer(document, id, (layer) => ({ ...layer, ...settings }));
}

export function setLayerMask(document: EditorDocument, id: string, mask: Mask) {
  const next = parse(maskSchema, mask, "Invalid mask");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "mask") {
      throw Error("Select a mask layer.");
    }
    return { ...layer, mask: next };
  });
}

function brushLayer(layer: Layer) {
  if (layer.kind !== "mask" || layer.mask.kind !== "brush") {
    throw Error("Select a brush mask.");
  }
  return { layer, strokes: layer.mask.strokes };
}

/** Starts a stroke on a brush mask; group it with the points that follow. */
export function paintStroke(
  document: EditorDocument,
  id: string,
  stroke: BrushStroke,
) {
  const painted = parse(strokeSchema, stroke, "Invalid stroke");
  editLayer(document, id, (item) => {
    const { layer, strokes } = brushLayer(item);
    return {
      ...layer,
      mask: { kind: "brush", strokes: [...strokes, painted] },
    };
  });
}

/** Appends points to the mask's last stroke, keeping earlier points so rendering only stamps the new ones. */
export function extendStroke(
  document: EditorDocument,
  id: string,
  points: readonly StrokePoint[],
) {
  const added = parse(strokePoints, points, "Invalid stroke points");
  editLayer(document, id, (item) => {
    const { layer, strokes } = brushLayer(item);
    const last = strokes.at(-1);
    if (!last) {
      throw Error("Start a stroke before extending it.");
    }
    const stroke = { ...last, points: [...last.points, ...added] };
    return {
      ...layer,
      mask: { kind: "brush", strokes: [...strokes.slice(0, -1), stroke] },
    };
  });
}

export function setMaskOperation(
  document: EditorDocument,
  id: string,
  operation: MaskLayer["operation"],
) {
  const next = parse(maskOperation, operation, "Invalid mask operation");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "mask") {
      throw Error("Select a mask layer.");
    }
    return { ...layer, operation: next };
  });
}

export function duplicateLayer(document: EditorDocument, id: string) {
  const source = processingLayer(document, id);
  function clone(layer: ProcessingLayer): ProcessingLayer {
    return {
      ...structuredClone(layer),
      id: crypto.randomUUID(),
      children: layer.children.map(clone),
    };
  }
  const layer = { ...clone(source), name: `${source.name} copy` };
  const scene = document.scene.getState();
  const parent = locateLayer(scene.layers, id)?.parent?.id;
  const next = changeChildren(scene, parent, (layers) =>
    layers.toSpliced(layers.findIndex((item) => item.id === id) + 1, 0, layer),
  );
  validateDepth(next.layers);
  document.history.commit();
  document.edit(next);
  document.selectLayer(layer.id);
  return layer.id;
}

export function deleteLayer(document: EditorDocument, id: string) {
  processingLayer(document, id);
  const scene = document.scene.getState();
  const next = changeChildren(
    scene,
    locateLayer(scene.layers, id)?.parent?.id,
    (layers) => layers.filter((layer) => layer.id !== id),
  );
  validateDepth(next.layers);
  document.history.commit();
  document.edit(next);
}

/** Index is the final sibling position, ordered bottom to top; the root image occupies index zero. */
export function moveLayer(
  document: EditorDocument,
  id: string,
  index: number,
  parentId?: string,
) {
  const layer = processingLayer(document, id);
  const scene = document.scene.getState();
  if (parentId && findLayer([layer], parentId)) {
    throw Error("A layer cannot contain itself.");
  }
  const removed = changeChildren(
    scene,
    locateLayer(scene.layers, id)?.parent?.id,
    (layers) => layers.filter((item) => item.id !== id),
  );
  const next = changeChildren(removed, parentId, (layers) => {
    const position = parentId ? index : index - 1;
    if (
      !Number.isInteger(position) ||
      position < 0 ||
      position > layers.length
    ) {
      throw Error("Invalid layer position.");
    }
    return layers.toSpliced(position, 0, layer);
  });
  validateDepth(next.layers);
  document.history.commit();
  document.edit(next);
}
