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
	defaultGeometry,
	type Geometry,
	orientedSize,
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
			const angle = (geometry.angle * Math.PI) / 180;
			const [width, height] = orientedSize(source.size, geometry.rotation);
			const cosine = Math.cos(angle);
			const sine = Math.sin(angle);
			const scale =
				cosine + Math.abs(sine) * Math.max(width / height, height / width);
			frame.pass(
				output,
				apply.set({
					source: source.color,
					params: {
						rect: [geometry.x, geometry.y, geometry.width, geometry.height],
						size: [width, height],
						rotation: geometry.rotation / 90,
						cosine,
						sine,
						scale,
					},
				}),
			);
			return output;
		},
		dispose() {
			output?.color.dispose();
		},
	};
}
