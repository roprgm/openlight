import { type RenderImage, renderNode } from "@/core/render/node";
import shader from "./unsharp-mask.wgsl";

/** Builds a separable luminance blur and combines it with the unchanged input. */
export function unsharpMask(
	name: string,
	input: RenderImage,
	amount: number,
	radius: number,
	reduction = 1,
) {
	if (amount === 0) {
		return input;
	}
	const size: [number, number] = [
		Math.ceil(input.size[0] / reduction),
		Math.ceil(input.size[1] / reduction),
	];
	const samplers = {
		linearSampler: { minFilter: "linear", magFilter: "linear" },
	} as const;
	const modes = reduction === 1 ? [1, 2] : [0, 1, 2];
	const labels = ["reduce", "horizontal", "vertical"];
	const params = { reduction, amount, sigma: radius / reduction };
	let blurred = input;
	for (const mode of modes) {
		blurred = renderNode(`${name}/${labels[mode]}`, shader, {
			inputs: { source: blurred, base: blurred },
			size,
			samplers,
			set: { params: { ...params, mode } },
		});
	}
	return renderNode(name, shader, {
		inputs: { source: input, base: blurred },
		samplers,
		set: { params: { ...params, mode: 3 } },
	});
}
