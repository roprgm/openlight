import type { Gpu, Target } from "vgpu";
import {
	createRenderGraph,
	input,
	merge,
	node,
	pipeline,
	type RenderImage,
} from "@/core/renderer";
import shader from "./chroma-pyramid.wgsl";
import downsample from "./downsample.wgsl";
import { estimateNoise } from "./noise";

/** Scale-dependent chroma shrinkage; full-resolution working luminance is unchanged. */
export function createChromaDenoising(gpu: Gpu, source: Target) {
	const graph = createRenderGraph(gpu);
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
			const pyramid: RenderImage[] = [input(source)];
			while (pyramid.length < 9) {
				const previous = pyramid[pyramid.length - 1];
				if (Math.min(...previous.size) < 4) {
					break;
				}
				pyramid.push(
					pipeline(previous, [
						node(`chroma-down-${pyramid.length}`, downsample, {
							size: [
								Math.ceil(previous.size[0] / 2),
								Math.ceil(previous.size[1] / 2),
							],
						}),
					]),
				);
			}
			const images = graph.render(pyramid);
			const variances: number[][][] = [];
			for (const image of images.slice(0, -1)) {
				const measured = await estimateNoise(gpu, image);
				checkOpen();
				const previous = variances[variances.length - 1];
				// Residual Bayer noise is correlated: halve its variance floor per level,
				// rather than assuming the fourfold reduction of independent white noise.
				variances.push(
					measured.map((bin, i) =>
						bin.map((v, c) => Math.max(v, (previous?.[i][c] ?? 0) * 0.5)),
					),
				);
			}
			let restored: RenderImage = input(images[images.length - 1]);
			for (let level = images.length - 2; level >= 0; level--) {
				restored = merge(
					{
						source: input(images[level]),
						coarse: input(images[level + 1]),
						coarseFiltered: restored,
					},
					node(`chroma-up-${level}`, shader, {
						set: {
							variance: variances[level],
							settings: [
								36 + 28 * level,
								level <= 1 ? 1 : 0,
								level === 0 ? 1 : 0,
								0,
							],
						},
					}),
				);
			}
			const [output] = graph.render([restored]);
			await gpu.gpu.queue.onSubmittedWorkDone();
			checkOpen();
			graph.render([input(output)]);
			filtered = output;
		},
		dispose() {
			disposed = true;
			graph.dispose();
		},
	};
}
