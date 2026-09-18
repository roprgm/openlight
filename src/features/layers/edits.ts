import type {
	EditorDocument,
	EffectLayer,
	LinearGradient,
} from "@/core/document";

function validateMask(mask?: LinearGradient) {
	if (
		mask &&
		(mask.start.length !== 2 ||
			mask.end.length !== 2 ||
			![...mask.start, ...mask.end].every(Number.isFinite) ||
			(mask.start[0] === mask.end[0] && mask.start[1] === mask.end[1]))
	) {
		throw Error("A gradient needs two distinct finite points.");
	}
}

function editLayer(
	document: EditorDocument,
	id: string,
	edit: (layer: EffectLayer) => EffectLayer,
) {
	const scene = document.scene.getState();
	if (!scene.layers.some((layer) => layer.id === id)) {
		throw Error("Effect layer is unavailable.");
	}
	document.edit({
		...scene,
		layers: scene.layers.map((layer) =>
			layer.id === id ? edit(layer) : layer,
		),
	});
}

export function addLayer(
	document: EditorDocument,
	kind: EffectLayer["kind"],
	mask?: LinearGradient,
) {
	validateMask(mask);
	const base = {
		id: crypto.randomUUID(),
		name: "Exposure",
		visible: true,
		opacity: 1,
		mask:
			mask &&
			({ start: [...mask.start], end: [...mask.end] } satisfies LinearGradient),
	};
	let layer: EffectLayer;
	if (kind === "exposure") {
		layer = { ...base, kind, exposure: 1 };
	} else if (kind === "vignette") {
		layer = {
			...base,
			name: "Vignette",
			kind,
			vignette: { intensity: 50, softness: 50 },
		};
	} else {
		throw Error("Unknown effect layer.");
	}
	document.history.commit();
	const scene = document.scene.getState();
	document.edit({ ...scene, layers: [...scene.layers, layer] });
	document.selectLayer(layer.id);
	return layer.id;
}

export function setLayer(
	document: EditorDocument,
	id: string,
	change: Partial<Pick<EffectLayer, "visible" | "opacity" | "name">>,
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
	mask?: LinearGradient,
) {
	validateMask(mask);
	editLayer(document, id, (layer) => ({
		...layer,
		mask: mask && { start: [...mask.start], end: [...mask.end] },
	}));
}

export function duplicateLayer(document: EditorDocument, id: string) {
	const scene = document.scene.getState();
	const index = scene.layers.findIndex((layer) => layer.id === id);
	const source = scene.layers[index];
	if (!source) {
		throw Error("Effect layer is unavailable.");
	}
	document.history.commit();
	const layer = {
		...structuredClone(source),
		id: crypto.randomUUID(),
		name: `${source.name} copy`,
	};
	document.edit({
		...scene,
		layers: scene.layers.toSpliced(index + 1, 0, layer),
	});
	document.selectLayer(layer.id);
	return layer.id;
}

export function deleteLayer(document: EditorDocument, id: string) {
	const scene = document.scene.getState();
	if (!scene.layers.some((layer) => layer.id === id)) {
		throw Error("Effect layer is unavailable.");
	}
	document.history.commit();
	document.edit({
		...scene,
		layers: scene.layers.filter((layer) => layer.id !== id),
	});
}

export function moveLayer(document: EditorDocument, id: string, index: number) {
	const scene = document.scene.getState();
	const layer = scene.layers.find((layer) => layer.id === id);
	if (
		!layer ||
		!Number.isInteger(index) ||
		index < 0 ||
		index >= scene.layers.length
	) {
		throw Error("Invalid layer position.");
	}
	document.history.commit();
	const layers = scene.layers
		.filter((layer) => layer.id !== id)
		.toSpliced(index, 0, layer);
	document.edit({ ...scene, layers });
}
