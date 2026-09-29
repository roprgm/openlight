import type { EditorDocument } from "./index";
import type { Layer, MaskLayer, ProcessingLayer, Scene } from "./scene";

type LayerLocation = {
  layer: Layer;
  siblings: readonly Layer[];
  parent?: Layer;
};

/** Every layer with its position, parents before their children. */
export function* walkLayers(
  layers: readonly Layer[],
  parent?: Layer,
): Generator<LayerLocation> {
  for (const layer of layers) {
    yield { layer, siblings: layers, parent };
    yield* walkLayers(layer.children, layer);
  }
}

export function locateLayer(layers: readonly Layer[], id: string) {
  for (const location of walkLayers(layers)) {
    if (location.layer.id === id) {
      return location;
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
