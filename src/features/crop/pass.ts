import {
	effect,
	type Frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import shader from "./crop.wgsl";
import {
	cropSize,
	cropTransform,
	defaultGeometry,
	type Geometry,
} from "./geometry";

/** One reusable transform target; identity geometry preserves the original texture. */
export function createCrop(gpu: Gpu) {
	const apply = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});
	let output: Target | undefined;
	return {
		render(frame: Frame, source: Target, geometry: Geometry) {
			if (
				Object.entries(defaultGeometry).every(
					([key, value]) => Reflect.get(geometry, key) === value,
				)
			) {
				return source;
			}
			const size = cropSize(source.size, geometry);
			output ??= target(gpu, { size, format: source.format });
			output.resize(size);
			frame.pass(
				output,
				apply.set({
					source: source.color,
					transform: cropTransform(geometry, source.size),
				}),
			);
			return output;
		},
		dispose() {
			output?.color.dispose();
		},
	};
}
