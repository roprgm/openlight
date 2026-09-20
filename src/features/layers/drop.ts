import { findLayer, locateLayer, type Scene } from "@/core/document";

export type LayerDrop = {
	id: string;
	target: string;
	position: "before" | "after" | "inside";
};

/** Resolve visual top-to-bottom placement into the document's bottom-to-top sibling index. */
export function layerDrop(
	scene: Scene,
	drop: LayerDrop,
): { index: number; parentId?: string } | undefined {
	const source = findLayer(scene.layers, drop.id);
	const location = locateLayer(scene.layers, drop.target);
	const target = location?.layer;
	if (
		!source ||
		source.kind === "image" ||
		!target ||
		!location ||
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
	const { siblings, parent } = location;
	if (parent && source.children.length) {
		return;
	}
	const remaining = siblings.filter((item) => item.id !== source.id);
	const index =
		remaining.findIndex((item) => item.id === target.id) +
		Number(drop.position === "before");
	if (!parent && index === 0) {
		return;
	}
	return { parentId: parent?.id, index };
}
