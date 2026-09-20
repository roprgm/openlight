import {
	type EditorDocument,
	editLayer,
	type ToneCurve,
} from "@/core/document";
import { defaultCurve, validateCurve } from "./curve";

export function setToneCurve(
	document: EditorDocument,
	points: ToneCurve = defaultCurve,
	id = document.scene.getState().layers[0].id,
) {
	validateCurve(points);
	editLayer(document, id, (layer) => {
		if (layer.kind !== "image" && layer.kind !== "mask") {
			throw Error("Select an image or mask layer.");
		}
		return { ...layer, toneCurve: points.map((point) => ({ ...point })) };
	});
}
