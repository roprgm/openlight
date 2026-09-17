import { effect, type Gpu, sampler } from "vgpu";
import { type RenderImage, renderNode } from "@/engine/render-graph";
import shader from "./unsharp-mask.wgsl";

/** Builds a separable luminance blur and combines it with the unchanged input. */
export function createUnsharpMask(gpu: Gpu, name: string, reduction = 1) {
	const linearSampler = sampler(gpu, {
		minFilter: "linear",
		magFilter: "linear",
	});
	const passes = Array.from({ length: 4 }, () =>
		effect(gpu, shader, { set: { linearSampler } }),
	);
	const modes = reduction === 1 ? [1, 2] : [0, 1, 2];
	const labels = ["reduce", "horizontal", "vertical"];
	return (input: RenderImage, amount: number, radius: number) => {
		if (amount === 0) {
			return input;
		}
		const size: [number, number] = [
			Math.ceil(input.size[0] / reduction),
			Math.ceil(input.size[1] / reduction),
		];
		const params = { reduction, amount, sigma: radius / reduction };
		let blurred = input;
		for (const mode of modes) {
			blurred = renderNode(
				`${name}/${labels[mode]}`,
				[blurred],
				([image]) =>
					passes[mode].set({
						source: image.color,
						base: image.color,
						params: { ...params, mode },
					}),
				{ size, format: input.format },
			);
		}
		return renderNode(name, [input, blurred], ([image, blur]) =>
			passes[3].set({
				source: image.color,
				base: blur.color,
				params: { ...params, mode: 3 },
			}),
		);
	};
}
