import { merge, node, type RenderImage, split } from "@/core/renderer";
import shader from "./unsharp-mask.wgsl";

/** Builds a separable luminance blur and combines it with the unchanged input. */
export function unsharpMask(
	name: string,
	amount: number,
	radius: number,
	reduction = 1,
) {
	if (amount === 0) {
		return;
	}
	return (image: RenderImage) => {
		const size: [number, number] = [
			Math.ceil(image.size[0] / reduction),
			Math.ceil(image.size[1] / reduction),
		];
		const samplers = {
			linearSampler: { minFilter: "linear", magFilter: "linear" },
		} as const;
		const modes = reduction === 1 ? [1, 2] : [0, 1, 2];
		const labels = ["reduce", "horizontal", "vertical"];
		const params = { reduction, amount, sigma: radius / reduction };
		function blur(mode: number) {
			const pass = node(`${name}/${labels[mode]}`, shader, {
				size,
				samplers,
				set: { params: { ...params, mode } },
			});
			return (source: RenderImage) => merge({ source, base: source }, pass);
		}
		const [original, blurred] = split(image, [[], modes.map(blur)]);
		return merge(
			{ source: original, base: blurred },
			node(name, shader, {
				samplers,
				set: { params: { ...params, mode: 3 } },
			}),
		);
	};
}
