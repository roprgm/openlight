import {
	type EditorDocument,
	editLayer,
	findLayer,
	type Gradient,
	type Layer,
	locateLayer,
	type ProcessingLayer,
	type Scene,
	updateLayer,
	walkLayers,
} from "@/core/document";

function validateMask(mask: Gradient) {
	if (mask.kind === "radial") {
		if (
			mask.center.length !== 2 ||
			mask.radius.length !== 2 ||
			![...mask.center, ...mask.radius, mask.angle, mask.feather].every(
				Number.isFinite,
			) ||
			mask.radius.some((value) => value <= 0) ||
			mask.feather < 0 ||
			mask.feather > 1
		) {
			throw Error(
				"A radial gradient needs positive radii, finite geometry, and feather from 0 to 1.",
			);
		}
		return;
	}
	if (
		mask.kind !== "linear" ||
		mask.start.length !== 2 ||
		mask.end.length !== 2 ||
		![...mask.start, ...mask.end].every(Number.isFinite) ||
		(mask.start[0] === mask.end[0] && mask.start[1] === mask.end[1])
	) {
		throw Error("A gradient needs two distinct finite points.");
	}
}

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
	return updateLayer(scene, parentId, (layer) => ({
		...layer,
		children: change(layer.children),
	}));
}

function validateDepth(layers: readonly Layer[]) {
	if (
		layers.some((layer) =>
			layer.children.some((child) => child.children.length > 0),
		)
	) {
		throw Error("Layers support two levels: a parent and its children.");
	}
}

export function addLayer(
	document: EditorDocument,
	layer: ProcessingLayer,
	parentId?: string,
) {
	const scene = document.scene.getState();
	const existing = new Set(walkLayers(scene.layers).map((item) => item.id));
	for (const item of walkLayers([layer])) {
		if (existing.has(item.id)) {
			throw Error("Layer IDs must be unique.");
		}
		existing.add(item.id);
	}
	const selected = document.selection.getState().layerId;
	const parent = parentId ?? locateLayer(scene.layers, selected)?.parent?.id;
	const next = changeChildren(scene, parent, (layers) => {
		const selectedIndex = layers.findIndex((item) => item.id === selected);
		const index = parentId ? layers.length : selectedIndex + 1;
		return layers.toSpliced(index, 0, layer);
	});
	validateDepth(next.layers);
	document.history.commit();
	document.edit(next);
	document.selectLayer(layer.id);
	return layer.id;
}

export function setLayer(
	document: EditorDocument,
	id: string,
	change: Partial<Pick<ProcessingLayer, "visible" | "opacity" | "name">>,
) {
	if (
		Object.keys(change).some(
			(key) => !["visible", "opacity", "name"].includes(key),
		) ||
		Object.values(change).some((value) => value === undefined) ||
		(change.opacity !== undefined &&
			(!Number.isFinite(change.opacity) ||
				change.opacity < 0 ||
				change.opacity > 1)) ||
		(change.visible !== undefined && typeof change.visible !== "boolean") ||
		(change.name !== undefined &&
			(typeof change.name !== "string" || !change.name.trim()))
	) {
		throw Error("Invalid layer settings.");
	}
	processingLayer(document, id);
	editLayer(document, id, (layer) => ({ ...layer, ...change }));
}

export function setExposure(
	document: EditorDocument,
	id: string,
	exposure: number,
) {
	if (!Number.isFinite(exposure) || Math.abs(exposure) > 5) {
		throw Error("Exposure must be between -5 and 5 EV.");
	}
	editLayer(document, id, (layer) => {
		if (layer.kind !== "exposure") {
			throw Error("Select an exposure layer.");
		}
		return { ...layer, exposure };
	});
}

export function setLayerMask(
	document: EditorDocument,
	id: string,
	mask: Gradient,
) {
	validateMask(mask);
	editLayer(document, id, (layer) => {
		if (layer.kind !== "mask") {
			throw Error("Select a mask layer.");
		}
		return { ...layer, mask: structuredClone(mask) };
	});
}

export function setMaskOperation(
	document: EditorDocument,
	id: string,
	operation: "add" | "subtract",
) {
	if (operation !== "add" && operation !== "subtract") {
		throw Error("Choose Add or Subtract for a mask.");
	}
	editLayer(document, id, (layer) => {
		if (layer.kind !== "mask") {
			throw Error("Select a mask layer.");
		}
		return { ...layer, operation };
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
