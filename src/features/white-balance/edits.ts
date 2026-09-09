import type { EditorDocument } from "@/lib/editor/document";
import type { WhiteBalance } from "@/lib/image-source";

/** Omit the change to restore the exact camera-recorded white balance. */
export function setWhiteBalance(
	document: EditorDocument,
	change?: Partial<WhiteBalance>,
) {
	const scene = document.scene.getState();
	const profile = document.resources.get(scene.source).whiteBalance;
	if (!profile)
		throw Error("This image does not support absolute white balance.");
	const next = change
		? { ...(scene.whiteBalance ?? profile.asShot), ...change }
		: profile.asShot;
	document.edit({ ...scene, whiteBalance: next });
}
