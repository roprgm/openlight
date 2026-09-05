import { type Adjustments, useScene } from "@/app/scene";
import {
	type CameraRawXmp,
	isCameraRawXmp,
	readCameraRawXmp,
} from "@/features/camera-raw-xmp/xmp";
import type { FileLoader } from "./registry";

function toAdjustments(xmp: CameraRawXmp): Partial<Adjustments> {
	const adjustments: Partial<Adjustments> = {
		exposure: xmp.exposure2012,
		contrast: xmp.contrast2012,
		highlights: xmp.highlights2012,
		shadows: xmp.shadows2012,
		whites: xmp.whites2012,
		blacks: xmp.blacks2012,
		vibrance: xmp.vibrance,
		saturation: xmp.saturation,
	};
	return Object.fromEntries(
		Object.entries(adjustments).filter(([, value]) => value !== undefined),
	);
}

async function importCameraRawXmp(file: File) {
	if (!(file instanceof File)) {
		throw new Error("importCameraRawXmp requires a File.");
	}
	const source = useScene.getState().source;
	if (!source) {
		throw new Error("Load an image before importing adjustments.");
	}
	const adjustments = toAdjustments(readCameraRawXmp(await file.text()));
	if (useScene.getState().source === source) {
		useScene.getState().setAdjustments(adjustments);
	}
}

export const cameraRawXmpLoader: FileLoader = {
	kind: "settings",
	accepts: isCameraRawXmp,
	load: importCameraRawXmp,
};
