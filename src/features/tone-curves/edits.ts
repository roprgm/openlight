import type { EditorDocument, ToneCurve } from "@/core/document";
import { defaultCurve, validateCurve } from "./curve";

export function setToneCurve(
	document: EditorDocument,
	points: ToneCurve = defaultCurve,
) {
	validateCurve(points);
	document.edit({
		...document.scene.getState(),
		toneCurve: points.map((point) => ({ ...point })),
	});
}
