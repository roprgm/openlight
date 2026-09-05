import {
	type Adjustments,
	adjustmentLimits,
	defaultAdjustments,
	type ImageLayer,
} from "@/app/scene";
import {
	defaultCurve,
	type ToneCurve,
	validateCurve,
} from "@/features/tone-curves/curve";
import type { EditorDocument } from "./index";

export function createImageLayer(source: string, name: string): ImageLayer {
	return {
		id: crypto.randomUUID(),
		source,
		name,
		visible: true,
		opacity: 1,
		adjustments: { ...defaultAdjustments },
		toneCurve: defaultCurve,
	};
}

export function getLayer(
	document: EditorDocument,
	id = document.selection.getState().layerId,
) {
	const layer = document.scene
		.getState()
		.layers.find((layer) => layer.id === id);
	if (!layer) {
		throw new Error("Layer is unavailable.");
	}
	return layer;
}

function editLayer(document: EditorDocument, next: ImageLayer) {
	const scene = document.scene.getState();
	document.edit({
		...scene,
		layers: scene.layers.map((layer) => (layer.id === next.id ? next : layer)),
	});
}

export function setLayer(
	document: EditorDocument,
	id: string,
	change: Partial<Pick<ImageLayer, "name" | "visible" | "opacity">>,
) {
	if (
		(change.name !== undefined &&
			(typeof change.name !== "string" || !change.name.trim())) ||
		(change.visible !== undefined && typeof change.visible !== "boolean") ||
		(change.opacity !== undefined &&
			(!Number.isFinite(change.opacity) ||
				change.opacity < 0 ||
				change.opacity > 1))
	) {
		throw new Error("Invalid layer properties.");
	}
	const { name, visible, opacity } = change;
	const layer = getLayer(document, id);
	editLayer(document, {
		...layer,
		name: name?.trim() ?? layer.name,
		visible: visible ?? layer.visible,
		opacity: opacity ?? layer.opacity,
	});
}

export function removeLayer(document: EditorDocument, id: string) {
	getLayer(document, id);
	document.history.commit();
	const scene = document.scene.getState();
	document.edit({
		...scene,
		layers: scene.layers.filter((layer) => layer.id !== id),
	});
}

export function moveLayer(document: EditorDocument, id: string, index: number) {
	const layer = getLayer(document, id);
	const scene = document.scene.getState();
	if (!Number.isInteger(index) || index < 0 || index >= scene.layers.length) {
		throw new Error("Invalid layer order.");
	}
	document.history.commit();
	const layers = scene.layers.filter((layer) => layer.id !== id);
	layers.splice(index, 0, layer);
	document.edit({ ...scene, layers });
}

export function setAdjustments(
	document: EditorDocument,
	change: Partial<Adjustments>,
	layerId = document.selection.getState().layerId,
) {
	for (const [name, value] of Object.entries(change)) {
		const limit = Reflect.get(adjustmentLimits, name);
		if (
			typeof limit !== "number" ||
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			Math.abs(value) > limit
		) {
			throw new Error(`Invalid adjustment: ${name}.`);
		}
	}
	const layer = getLayer(document, layerId);
	editLayer(document, {
		...layer,
		adjustments: { ...layer.adjustments, ...change },
	});
}

export function setToneCurve(
	document: EditorDocument,
	points: ToneCurve = defaultCurve,
	layerId = document.selection.getState().layerId,
) {
	validateCurve(points);
	editLayer(document, {
		...getLayer(document, layerId),
		toneCurve: points.map((point) => ({ ...point })),
	});
}
