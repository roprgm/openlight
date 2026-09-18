import { findLayer, type Layer, type Scene } from "@/core/document";

export type LayerDrop = {
	id: string;
	target: string;
	position: "before" | "after" | "inside";
};

function siblingsOf(
	layers: readonly Layer[],
	id: string,
): { layers: readonly Layer[]; parent?: Layer } | undefined {
	if (layers.some((layer) => layer.id === id)) {
		return { layers };
	}
	for (const parent of layers) {
		if (parent.children.some((child) => child.id === id)) {
			return { layers: parent.children, parent };
		}
	}
}

/** Resolve visual top-to-bottom placement into the document's bottom-to-top sibling index. */
export function layerDrop(
	scene: Scene,
	drop: LayerDrop,
): { index: number; parentId?: string } | undefined {
	const source = findLayer(scene.layers, drop.id);
	const target = findLayer(scene.layers, drop.target);
	if (
		!source ||
		source.kind === "image" ||
		!target ||
		findLayer([source], target.id)
	) {
		return;
	}
	if (drop.position === "inside") {
		if (source.children.length || !scene.layers.includes(target)) {
			return;
		}
		return {
			parentId: target.id,
			index: target.children.filter((item) => item.id !== source.id).length,
		};
	}
	const siblings = siblingsOf(scene.layers, target.id);
	if (!siblings || (siblings.parent && source.children.length)) {
		return;
	}
	const remaining = siblings.layers.filter((item) => item.id !== source.id);
	const index =
		remaining.findIndex((item) => item.id === target.id) +
		Number(drop.position === "before");
	if (!siblings.parent && index === 0) {
		return;
	}
	return { parentId: siblings.parent?.id, index };
}
