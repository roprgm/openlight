import { effect, type Frame, type Gpu, type Target, target } from "vgpu";
import { sampleCurve, type ToneCurve } from "./curve";
import shader from "./curves.wgsl";

const curveSize = 1024;

export function createToneCurves(gpu: Gpu, source: Target) {
	const output = target(gpu, { size: source.size, format: source.format });
	const curve = gpu.device.createBuffer({
		size: curveSize * Float32Array.BYTES_PER_ELEMENT,
		usage: ["storage", "copy_dst"],
	});
	const apply = effect(gpu, shader, { set: { source: source.color, curve } });
	return {
		render(frame: Frame, points: ToneCurve) {
			if (points.every((point) => point.x === point.y)) {
				return source;
			}
			curve.write(sampleCurve(points, curveSize));
			frame.pass(output, apply);
			return output;
		},
		dispose() {
			output.color.dispose();
			curve.dispose();
		},
	};
}
