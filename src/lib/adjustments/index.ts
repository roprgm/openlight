import {
	effect,
	type Frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import shader from "./adjustments.wgsl";

/** UI units: exposure in stops, every other adjustment in -100..100. */
export type Adjustments = {
	exposure: number;
	incrementalTemperature: number;
	incrementalTint: number;
	contrast: number;
	highlights: number;
	shadows: number;
	whites: number;
	blacks: number;
	vibrance: number;
	saturation: number;
};

/** Owns the adjustment pass and output for one source. */
export function createAdjustments(gpu: Gpu, source: Target) {
	const output = target(gpu, { size: source.size, format: source.format });
	const apply = effect(gpu, shader, {
		set: {
			source: source.color,
			sourceSampler: sampler(gpu, {
				minFilter: "linear",
				magFilter: "linear",
			}),
		},
	});
	return {
		output,
		render(frame: Frame, adjustments: Adjustments) {
			frame.pass(output, apply.set({ adjustments }));
		},
		dispose() {
			output.color.dispose();
		},
	};
}
