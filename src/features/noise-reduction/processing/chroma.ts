import type { Gpu, Target } from "vgpu";
import {
	createRenderGraph,
	input,
	merge,
	node,
	pipeline,
} from "@/core/renderer";
import shader from "./chroma.wgsl";
import downsample from "./downsample.wgsl";
import { createDenoising } from "./index";
import { estimateNoise } from "./noise";

/** Clean developed Bayer color at quarter resolution; retain full-resolution luminance. */
export function createChromaDenoising(gpu: Gpu, source: Target) {
	const graph = createRenderGraph(gpu);
	let filter: ReturnType<typeof createDenoising> | undefined;
	let filtered: Target | undefined;
	let disposed = false;
	function checkOpen() {
		if (disposed) {
			throw Error("Chroma noise reduction was cancelled.");
		}
	}
	return {
		texture: () => filtered,
		async prepare() {
			checkOpen();
			if (filtered) {
				return;
			}
			if (Math.min(...source.size) < 96) {
				filtered = source;
				return;
			}
			const half = pipeline(input(source), [
				node("chroma-half", downsample, {
					size: [Math.ceil(source.size[0] / 2), Math.ceil(source.size[1] / 2)],
				}),
			]);
			const quarter = pipeline(half, [
				node("chroma-quarter", downsample, {
					size: [Math.ceil(half.size[0] / 2), Math.ceil(half.size[1] / 2)],
				}),
			]);
			const [halfImage, quarterImage] = graph.render([half, quarter]);
			try {
				// Correlated color needs stronger shrinkage than the fine-grain model.
				// Only the color delta returns to the full-resolution image.
				filter = createDenoising(gpu, quarterImage, 4);
				await filter.prepare(100);
				checkOpen();
				const result = filter.texture();
				if (!result) {
					throw Error("Chroma noise reduction produced no image.");
				}
				// Measure broad color variation where it becomes resolvable noise.
				// Fine-scale estimates miss correlation and would reject its correction.
				const variance = await estimateNoise(gpu, quarterImage);
				checkOpen();
				const correctedHalf = merge(
					{
						source: input(halfImage),
						coarse: input(quarterImage),
						coarseFiltered: input(result),
					},
					node("chroma-restore-half", shader, {
						set: { variance },
					}),
				);
				const corrected = merge(
					{
						source: input(source),
						coarse: input(halfImage),
						coarseFiltered: correctedHalf,
					},
					node("chroma-restore-full", shader, { set: { variance } }),
				);
				const [output] = graph.render([corrected]);
				await gpu.gpu.queue.onSubmittedWorkDone();
				checkOpen();
				// Retain only the final correction, releasing the reduced pyramid targets.
				filter.dispose();
				filter = undefined;
				graph.render([input(output)]);
				filtered = output;
			} finally {
				filter?.dispose();
				filter = undefined;
			}
		},
		dispose() {
			disposed = true;
			filter?.dispose();
			graph.dispose();
		},
	};
}
