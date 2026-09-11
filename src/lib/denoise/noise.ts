import { compute, type Gpu, type Target } from "vgpu";
import shader from "./statistics.wgsl";

function median(values: number[]) {
	const sorted = values.toSorted((a, b) => a - b);
	return (sorted[sorted.length >> 1] + sorted[(sorted.length - 1) >> 1]) / 2;
}

/** Perceptual noise is not a RAW shot/read model: interpolate measured variances by brightness. */
export function fitNoise(statistics: Float32Array) {
	const bins: number[][][] = Array.from({ length: 16 }, () => [[], [], []]);
	for (let i = 0; i < statistics.length; i += 8) {
		const brightness = statistics[i] / Math.sqrt(3);
		if (!Number.isFinite(brightness)) {
			continue;
		}
		const bin = Math.min(15, Math.max(0, Math.round(brightness * 15)));
		for (let c = 0; c < 3; c++) {
			const variance = statistics[i + 4 + c];
			if (Number.isFinite(variance) && variance >= 0) {
				bins[bin][c].push(variance);
			}
		}
	}
	return bins.map((_, index) => [
		...[0, 1, 2].map((c) => {
			const measured = bins
				.map((bin, i) => ({ i, values: bin[c] }))
				.filter((bin) => bin.values.length);
			if (!measured.length) {
				return 1e-10;
			}
			const left = measured.findLast((bin) => bin.i <= index) ?? measured[0];
			const right =
				measured.find((bin) => bin.i >= index) ?? measured[measured.length - 1];
			const weight =
				left.i === right.i ? 0 : (index - left.i) / (right.i - left.i);
			return Math.max(
				1e-10,
				median(left.values) * (1 - weight) + median(right.values) * weight,
			);
		}),
		1e-10,
	]);
}

export async function estimateNoise(gpu: Gpu, source: Target) {
	const grid = source.size.map((size) => Math.min(32, Math.floor(size / 24)));
	if (grid.includes(0)) {
		return fitNoise(new Float32Array());
	}
	const bytes = grid[0] * grid[1] * 32;
	const statistics = gpu.device.createBuffer({
		size: bytes,
		usage: ["storage", "copy_src"],
	});
	try {
		compute(gpu, shader)
			.set({ source, statistics, grid })
			.dispatch(grid[0], grid[1]);
		return fitNoise(new Float32Array(await statistics.read(bytes)));
	} finally {
		statistics.dispose();
	}
}
