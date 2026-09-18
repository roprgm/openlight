import type { EditorDocument, Vignette } from "@/core/document";

export function validateVignette(change: Partial<Vignette>) {
	for (const [name, value] of Object.entries(change)) {
		if (
			(name !== "intensity" && name !== "softness") ||
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			value < 0 ||
			value > 100
		) {
			throw new Error(`Invalid vignette adjustment: ${name}.`);
		}
	}
}

export function setVignette(
	document: EditorDocument,
	change: Partial<Vignette>,
	id: string,
) {
	validateVignette(change);
	const scene = document.scene.getState();
	const layer = scene.layers.find((layer) => layer.id === id);
	if (layer?.kind !== "vignette") {
		throw Error("Select a vignette layer.");
	}
	const current = layer.vignette;
	const next = { ...current, ...change };
	if (
		next.intensity === current.intensity &&
		next.softness === current.softness
	) {
		return;
	}
	document.edit({
		...scene,
		layers: scene.layers.map((item) =>
			item.id === id ? { ...layer, vignette: next } : item,
		),
	});
}
