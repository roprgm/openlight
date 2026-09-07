import {
	effect,
	type Frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import shader from "./clarity.wgsl";

/** Owns the reduced Gaussian blur and the full-resolution local-contrast output. */
export function createClarity(gpu: Gpu, source: Target) {
	const reduction = 16;
	const size: [number, number] = [
		Math.ceil(source.size[0] / reduction),
		Math.ceil(source.size[1] / reduction),
	];
	const temporary = Array.from({ length: 3 }, () =>
		target(gpu, { size, format: "rgba16float" }),
	);
	const output = target(gpu, { size: source.size, format: source.format });
	const linearSampler = sampler(gpu, {
		minFilter: "linear",
		magFilter: "linear",
	});
	// Reduce, blur horizontally, blur vertically, reconstruct. Each pass owns its uniforms.
	const passes = Array.from({ length: 4 }, (_, mode) =>
		effect(gpu, shader, {
			set: {
				base: source.color,
				linearSampler,
				params: { mode, reduction, amount: 0 },
			},
		}),
	);
	return {
		render(frame: Frame, input: Target, amount: number) {
			if (amount === 0) return input;
			for (const [i, image] of temporary.entries()) {
				frame.pass(
					image,
					passes[i].set({
						source: i === 0 ? input.color : temporary[i - 1].color,
					}),
				);
			}
			frame.pass(
				output,
				passes[3].set({
					source: input.color,
					base: temporary[2].color,
					// Keep half the local detail at -100 instead of replacing it with the blur.
					params: { mode: 3, reduction, amount: amount / 200 },
				}),
			);
			return output;
		},
		dispose() {
			for (const image of [...temporary, output]) image.color.dispose();
		},
	};
}
