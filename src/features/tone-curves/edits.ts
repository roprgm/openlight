import type { EditorDocument, ToneCurve } from "@/core/document";
import { defaultCurve, validateCurve } from "./curve";

export function setToneCurve(
	document: EditorDocument,
	points: ToneCurve = defaultCurve,
) {
	validateCurve(points);
	const scene = document.scene.getState();
	document.edit({
		...scene,
		image: { ...scene.image, toneCurve: points.map((point) => ({ ...point })) },
	});
}
