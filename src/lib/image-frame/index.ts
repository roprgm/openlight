import {
	effect,
	type Frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import shader from "./frame.wgsl";
import {
	frameTransform,
	frameValues,
	type ImageFrame,
	imageFrame,
} from "./geometry";

/** Transforms image outputs; equal inputs share a target and identity preserves the source. */
export function createImageFrame(gpu: Gpu) {
	const apply = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});
	const outputs = new Map<Target, Target>();
	return {
		render(frame: Frame, sources: Target[], geometry: ImageFrame) {
			const initial = frameValues(imageFrame(sources[0].size));
			if (frameValues(geometry).every((value, i) => value === initial[i])) {
				return sources;
			}
			const rendered = new Set<Target>();
			return sources.map((source) => {
				const size: [number, number] = [
					Math.round(geometry.size[0]),
					Math.round(geometry.size[1]),
				];
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
							transform: frameTransform(geometry, source.size),
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
