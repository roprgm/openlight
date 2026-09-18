import type { EditorDocument } from "@/core/document";

export function setNoiseReduction(document: EditorDocument, amount: number) {
	if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
		throw Error("Noise reduction must be between 0 and 100.");
	}
	document.edit({ ...document.scene.getState(), noiseReduction: amount });
}
