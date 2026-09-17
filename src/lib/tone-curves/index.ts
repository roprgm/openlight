import { type RenderImage, renderNode } from "@/core/render/node";
import { sampleCurve, type ToneCurve } from "./curve";
import shader from "./curves.wgsl";

export function toneCurves(input: RenderImage, points: ToneCurve) {
	if (points.every((point) => point.x === point.y)) {
		return input;
	}
	return renderNode("curves", shader, {
		inputs: { source: input },
		storage: { curve: sampleCurve(points, 1024) },
	});
}
