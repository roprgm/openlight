import type { EditorDocument } from "@/lib/editor/document";
import type { Vignette } from "@/lib/editor/scene";
import { defaultVignette } from "./model";

export function setVignette(
	document: EditorDocument,
	change: Partial<Vignette>,
) {
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
	const scene = document.scene.getState();
	const current = scene.vignette ?? defaultVignette;
	const next = { ...current, ...change };
	if (
		next.intensity === current.intensity &&
		next.softness === current.softness
	) {
		return;
	}
	document.edit({ ...scene, vignette: next });
}
