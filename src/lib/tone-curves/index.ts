import { effect, type Gpu } from "vgpu";
import { type RenderImage, renderNode } from "@/engine/render-graph";
import { sampleCurve, type ToneCurve } from "./curve";
import shader from "./curves.wgsl";

const curveSize = 1024;

export function createToneCurves(gpu: Gpu) {
	const curve = gpu.device.createBuffer({
		size: curveSize * Float32Array.BYTES_PER_ELEMENT,
		usage: ["storage", "copy_dst"],
	});
	const apply = effect(gpu, shader, { set: { curve } });
	return {
		render(input: RenderImage, points: ToneCurve) {
			if (points.every((point) => point.x === point.y)) {
				return input;
			}
			return renderNode("curves", [input], ([image]) => {
				curve.write(sampleCurve(points, curveSize));
				return apply.set({ source: image.color });
			});
		},
		dispose() {
			curve.dispose();
		},
	};
}
