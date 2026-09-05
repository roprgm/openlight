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

/** Reuses a canvas-sized adjustment pass for each image source. */
export function createAdjustments(
	gpu: Gpu,
	canvas: Pick<Target, "size" | "format">,
) {
	const output = target(gpu, { size: canvas.size, format: canvas.format });
	const apply = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, {
				minFilter: "linear",
				magFilter: "linear",
			}),
		},
	});
	return {
		output,
		render(
			frame: Frame,
			adjustments: Adjustments,
			source: Target,
			imageSize: readonly number[],
		) {
			frame.pass(
				output,
				apply.set({
					adjustments,
					source: source.color,
					params: { size: canvas.size, imageSize },
				}),
			);
		},
		dispose() {
			output.color.dispose();
		},
	};
}
