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

/** Transforms image outputs; equal inputs share a target and identity preserves the source. */
export function createCrop(gpu: Gpu) {
	const apply = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});
	const outputs = new Map<Target, Target>();
	return {
		render(frame: Frame, sources: Target[], geometry: Geometry) {
			if (
				Object.entries(defaultGeometry).every(
					([key, value]) => Reflect.get(geometry, key) === value,
				)
			) {
				return sources;
			}
			const rendered = new Set<Target>();
			return sources.map((source) => {
				const size = cropSize(source.size, geometry);
				let output = outputs.get(source);
				if (!output) {
					output = target(gpu, { size, format: source.format });
					outputs.set(source, output);
				}
				output.resize(size);
				if (!rendered.has(source)) {
					frame.pass(
						output,
						apply.set({
							source: source.color,
							transform: cropTransform(geometry, source.size),
						}),
					);
				}
				rendered.add(source);
				return output;
			});
		},
		dispose() {
			for (const output of outputs.values()) {
				output.color.dispose();
			}
			outputs.clear();
		},
	};
}
