import type { EditorDocument } from "@/core/document";
import type { WhiteBalance } from "@/core/image";

export function whiteBalanceLimits(asShot: WhiteBalance) {
	return {
		temperature: {
			min: Math.min(2000, asShot.temperature),
			max: Math.max(25000, asShot.temperature),
		},
		tint: {
			min: Math.min(-150, asShot.tint),
			max: Math.max(150, asShot.tint),
		},
	};
}

function validateWhiteBalance(balance: WhiteBalance, asShot: WhiteBalance) {
	const limits = whiteBalanceLimits(asShot);
	for (const channel of ["temperature", "tint"] as const) {
		const value = balance[channel];
		const { min, max } = limits[channel];
		if (!Number.isFinite(value) || value < min || value > max) {
			throw Error("Invalid RAW white balance.");
		}
	}
}

/** Without a change, resets to the camera's as-shot balance. */
export function setWhiteBalance(
	document: EditorDocument,
	change?: Partial<WhiteBalance>,
) {
	const scene = document.scene.getState();
	const asShot = document.resources.get(scene.image.source).raw?.asShot;
	if (!asShot) {
		throw Error("This image does not support RAW white balance.");
	}
	let whiteBalance = asShot;
	if (change) {
		whiteBalance = { ...(scene.image.whiteBalance ?? asShot), ...change };
		validateWhiteBalance(whiteBalance, asShot);
	}
	document.edit({ ...scene, image: { ...scene.image, whiteBalance } });
}
