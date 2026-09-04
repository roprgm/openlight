import { type Adjustments, useScene } from "@/app/scene";
import {
	type CameraRawXmp,
	isCameraRawXmp,
	readCameraRawXmp,
} from "@/features/camera-raw-xmp/xmp";
import type { FileLoader } from "./registry";

function toAdjustments(xmp: CameraRawXmp): Partial<Adjustments> {
	return {
		...(xmp.exposure2012 === undefined ? {} : { exposure: xmp.exposure2012 }),
		...(xmp.contrast2012 === undefined ? {} : { contrast: xmp.contrast2012 }),
		...(xmp.vibrance === undefined ? {} : { vibrance: xmp.vibrance }),
		...(xmp.saturation === undefined ? {} : { saturation: xmp.saturation }),
	};
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
