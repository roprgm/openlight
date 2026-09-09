import type { EditorDocument } from "@/lib/editor/document";
import type { WhiteBalance } from "@/lib/image-source";

export function setWhiteBalance(
	document: EditorDocument,
	change?: Partial<WhiteBalance>,
) {
	const scene = document.scene.getState();
	const asShot = document.resources.get(scene.source).raw?.asShot;
	if (!asShot) {
		throw Error("This image does not support RAW white balance.");
	}
	let whiteBalance = asShot;
	if (change) {
		whiteBalance = { ...(scene.whiteBalance ?? asShot), ...change };
	}
	document.edit({ ...scene, whiteBalance });
}
