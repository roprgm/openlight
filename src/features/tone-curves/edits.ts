import {
	type EditorDocument,
	editLayer,
	type ToneCurve,
} from "@/core/document";
import { defaultCurve, validateCurve } from "./curve";

export function setToneCurve(
	document: EditorDocument,
	points: ToneCurve = defaultCurve,
	id: string,
) {
	validateCurve(points);
	editLayer(document, id, (layer) => {
		if (layer.kind !== "curves") {
			throw Error("Select a curves layer.");
		}
		return { ...layer, toneCurve: points.map((point) => ({ ...point })) };
	});
}
