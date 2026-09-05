import { setAdjustments } from "@/app/document/edits";
import type { Adjustments } from "@/app/scene";
import type { Workspace } from "@/app/workspace";
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

export function createCameraRawXmpLoader(workspace: Workspace): FileLoader {
	return {
		kind: "settings",
		accepts: isCameraRawXmp,
		async load(file) {
			if (!(file instanceof File)) {
				throw new Error("importXmp requires a File.");
			}
			const document = workspace.getDocument();
			const layerId = document.selection.getState().layerId;
			const adjustments = toAdjustments(readCameraRawXmp(await file.text()));
			if (
				workspace.state.getState().document === document &&
				document.scene.getState().layers.some((layer) => layer.id === layerId)
			) {
				document.history.commit();
				setAdjustments(document, adjustments, layerId);
			}
		},
	};
}
