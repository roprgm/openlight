import type { EditorDocument } from "./index";
import type { Layer, ProcessingLayer, Scene } from "./scene";

export function walkLayers(layers: readonly Layer[]): Layer[] {
	return layers.flatMap((layer) => [layer, ...walkLayers(layer.children)]);
}

export function findLayer(
	layers: readonly Layer[],
	id: string,
): Layer | undefined {
	for (const layer of layers) {
		if (layer.id === id) {
			return layer;
		}
		const child = findLayer(layer.children, id);
		if (child) {
			return child;
		}
	}
	return undefined;
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

export function editLayer(
	document: EditorDocument,
	id: string,
	update: (layer: Layer) => Layer,
) {
	const scene = document.scene.getState();
	if (!findLayer(scene.layers, id)) {
		throw Error("Layer is unavailable.");
	}
	const [image, ...layers] = scene.layers;
	const base =
		image.id === id
			? update(image)
			: { ...image, children: updateChildren(image.children, id, update) };
	if (base.kind !== "image") {
		throw Error("The image layer is pinned.");
	}
	const next: Scene = {
		...scene,
		layers: [base, ...updateChildren(layers, id, update)],
	};
	document.edit(next);
}
