import type { EditorDocument } from "./index";
import type { Layer, ProcessingLayer, Scene } from "./scene";

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

function updateChildren(
	layers: readonly ProcessingLayer[],
	id: string,
	update: (layer: Layer) => Layer,
): readonly ProcessingLayer[] {
	return layers.map((layer) => {
		if (layer.id === id) {
			const next = update(layer);
			if (next.kind === "image") {
				throw Error("An image cannot replace a processing layer.");
			}
			return next;
		}
		const children = updateChildren(layer.children, id, update);
		return children.every((child, index) => child === layer.children[index])
			? layer
			: { ...layer, children };
	});
}

export function updateLayer(
	scene: Scene,
	id: string,
	update: (layer: Layer) => Layer,
): Scene {
	if (!findLayer(scene.layers, id)) {
		throw Error("Layer is unavailable.");
	}
	const [image, ...layers] = scene.layers;
	const children = updateChildren(image.children, id, update);
	const base = image.id === id ? update(image) : image;
	if (base.kind !== "image") {
		throw Error("The image layer is pinned.");
	}
	return {
		...scene,
		layers: [
			children.every((child, index) => child === image.children[index])
				? base
				: { ...base, children },
			...updateChildren(layers, id, update),
		],
	};
}

export function editLayer(
	document: EditorDocument,
	id: string,
	update: (layer: Layer) => Layer,
) {
	document.edit(updateLayer(document.scene.getState(), id, update));
}
