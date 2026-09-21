import type { EditorDocument } from "./index";
import type { Layer, MaskLayer, ProcessingLayer, Scene } from "./scene";

export function walkLayers(layers: readonly Layer[]): Layer[] {
  return layers.flatMap((layer) => [layer, ...walkLayers(layer.children)]);
}

type LayerLocation = {
  layer: Layer;
  siblings: readonly Layer[];
  parent?: Layer;
};

export function locateLayer(
  layers: readonly Layer[],
  id: string,
  parent?: Layer,
): LayerLocation | undefined {
  for (const layer of layers) {
    if (layer.id === id) {
      return { layer, siblings: layers, parent };
    }
    const child = locateLayer(layer.children, id, layer);
    if (child) {
      return child;
    }
  }
  return undefined;
}

export function findLayer(layers: readonly Layer[], id: string) {
  return locateLayer(layers, id)?.layer;
}

/** A mask inside a mask only shapes coverage; its parent owns the adjustments and curve. */
export function adjustmentTarget(layers: readonly Layer[], id: string) {
  const location = locateLayer(layers, id);
  if (!location) {
    return undefined;
  }
  const { layer, parent } = location;
  return layer.kind === "mask" && parent?.kind === "mask" ? parent : layer;
}

/** The child masks that currently add to or subtract from a mask's coverage. */
export function maskModifiers(layer: MaskLayer) {
  return layer.children.filter(
    (child): child is MaskLayer =>
      child.kind === "mask" && child.visible && child.opacity > 0,
  );
}

function withChildren<L extends Layer>(
  layer: L,
  children: readonly ProcessingLayer[],
): L {
  return children.every((child, index) => child === layer.children[index])
    ? layer
    : { ...layer, children };
}

export function updateLayer(
  scene: Scene,
  id: string,
  update: (layer: Layer) => Layer,
): Scene {
  const [image, ...layers] = scene.layers;
  let matched = image.id === id;
  function updateChildren(
    items: readonly ProcessingLayer[],
  ): readonly ProcessingLayer[] {
    return items.map((layer) => {
      if (layer.id !== id) {
        return withChildren(layer, updateChildren(layer.children));
      }
      matched = true;
      const next = update(layer);
      if (next.kind === "image") {
        throw Error("An image cannot replace a processing layer.");
      }
      return next;
    });
  }
  const children = updateChildren(image.children);
  const base = image.id === id ? update(image) : image;
  if (base.kind !== "image") {
    throw Error("The image layer is pinned.");
  }
  const next: Scene["layers"] = [
    withChildren(base, children),
    ...updateChildren(layers),
  ];
  if (!matched) {
    throw Error("Layer is unavailable.");
  }
  return { ...scene, layers: next };
}

export function editLayer(
  document: EditorDocument,
  id: string,
  update: (layer: Layer) => Layer,
) {
  document.edit(updateLayer(document.scene.getState(), id, update));
}
