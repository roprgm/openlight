import type { ToneCurve } from "@/core/document";
import { node } from "@/core/renderer";
import { sampleCurve } from "./curve";
import shader from "./curves.wgsl";

export function toneCurves(points: ToneCurve) {
	if (points.every((point) => point.x === point.y)) {
		return;
	}
	return node("curves", shader, {
		storage: { curve: sampleCurve(points, 1024) },
	});
}
