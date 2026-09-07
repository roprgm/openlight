import {
	effect,
	type Frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import shader from "./unsharp-mask.wgsl";

/** Owns a separable luminance blur and unsharp-mask output. Radius is Gaussian sigma in source pixels. */
export function createUnsharpMask(gpu: Gpu, source: Target, reduction = 1) {
	const size: [number, number] = [
		Math.ceil(source.size[0] / reduction),
		Math.ceil(source.size[1] / reduction),
	];
	const modes = reduction === 1 ? [1, 2] : [0, 1, 2];
	const temporary = Array.from({ length: modes.length }, () =>
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
				params: { mode, reduction, amount: 0, sigma: 1 },
			},
		}),
	);
	return {
		render(frame: Frame, input: Target, amount: number, radius: number) {
			if (amount === 0) return input;
			const params = { reduction, amount, sigma: radius / reduction };
			for (const [i, image] of temporary.entries()) {
				frame.pass(
					image,
					passes[modes[i]].set({
						params: { ...params, mode: modes[i] },
						source: i === 0 ? input.color : temporary[i - 1].color,
					}),
				);
			}
			frame.pass(
				output,
				passes[3].set({
					source: input.color,
					base: temporary[temporary.length - 1].color,
					params: { ...params, mode: 3 },
				}),
			);
			return output;
		},
		dispose() {
			for (const image of [...temporary, output]) image.color.dispose();
		},
	};
}
