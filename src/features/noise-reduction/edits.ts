import type { EditorDocument } from "@/lib/editor/document";

export function setNoiseReduction(document: EditorDocument, amount: number) {
	document.edit({ ...document.scene.getState(), noiseReduction: amount });
}
