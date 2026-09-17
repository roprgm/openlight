// Adapted from GALOSH (Copyright 2026 luxgrain), Apache-2.0.
// Substantially modified for OpenLight; provenance and changes:
// /licenses/galosh/NOTICE; license: /licenses/galosh/LICENSE.
import { compute, type Gpu } from "vgpu";
import shader from "./statistics.wgsl";
export type Sensor = { crop: number[]; black: number[]; white: number };

export type NoiseModel = { shot: number[]; read: number[] };

/** Fit Var[x] = shot*x + read from the quieter patches at each signal level. */
export function fitNoiseModel(statistics: Float32Array): NoiseModel {
	const shot: number[] = [];
	const read: number[] = [];
	for (let c = 0; c < 4; c++) {
		const patches = Array.from({ length: statistics.length / 8 }, (_, i) => ({
			x: statistics[i * 8 + c],
			y: statistics[i * 8 + 4 + c],
		})).filter(({ x, y }) => Number.isFinite(x + y) && x < 0.95 && y >= 0);
		patches.sort((a, b) => a.x - b.x);
		const points = [];
		const chunk = Math.max(8, Math.ceil(patches.length / 16));
		for (let i = 0; i < patches.length; i += chunk) {
			const bin = patches.slice(i, i + chunk).sort((a, b) => a.y - b.y);
			// MAD estimates themselves fluctuate. A conservative lower envelope limits texture bias.
			const quiet = bin.slice(
				Math.floor(bin.length * 0.15),
				Math.max(1, Math.ceil(bin.length * 0.5)),
			);
			points.push({
				x: quiet.reduce((s, p) => s + p.x, 0) / quiet.length,
				y: quiet.reduce((s, p) => s + p.y, 0) / quiet.length,
			});
		}
		const meanX =
			points.reduce((s, p) => s + p.x, 0) / Math.max(points.length, 1);
		const meanY =
			points.reduce((s, p) => s + p.y, 0) / Math.max(points.length, 1);
		const xx = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
		const xy = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
		// An over-steep shot fit must not turn measured shadow noise into a nearly
		// zero denominator in the signed variance transform. Keep a small fraction
		// of the quietest observed variance, and refit the slope to the same mean.
		const readFloor = Math.max(
			1e-10,
			points.length ? Math.min(...points.map((p) => p.y)) * 0.1 : 0,
		);
		const slope =
			xx > 1e-6
				? Math.max(
						0,
						Math.min(xy / xx, (meanY - readFloor) / Math.max(meanX, 1e-6)),
					)
				: 0;
		shot.push(slope);
		read.push(Math.max(meanY - slope * meanX, readFloor));
	}
	return { shot, read };
}

export async function estimateNoise(
	gpu: Gpu,
	source: GPUTexture,
	params: Sensor,
) {
	const grid = params.crop
		.slice(2)
		.map((n) => Math.min(32, Math.floor(n / 16)));
	if (grid.some((n) => n === 0))
		return { shot: [0, 0, 0, 0], read: [1e-10, 1e-10, 1e-10, 1e-10] };
	const statistics = gpu.device.createBuffer({
		size: grid[0] * grid[1] * 32,
		usage: ["storage", "copy_src"],
	});
	try {
		compute(gpu, shader)
			.set({ source, statistics, params: { ...params, grid } })
			.dispatch(grid[0], grid[1]);
		return fitNoiseModel(
			new Float32Array(await statistics.read(grid[0] * grid[1] * 32)),
		);
	} finally {
		statistics.dispose();
	}
}
