import { compute, type Gpu } from "vgpu";
import shader from "./statistics.wgsl";
export type Sensor = { crop: number[]; black: number[]; white: number };

export type NoiseModel = { shot: number[]; read: number[] };

function median(values: number[]) {
	const ordered = values.toSorted((a, b) => a - b);
	const middle = Math.floor(ordered.length / 2);
	return ordered.length
		? (ordered[middle] + ordered[(ordered.length - 1) >> 1]) / 2
		: 0;
}

/** Haar detail variances, binned medians and a Theil–Sen affine fit. */
export function fitNoiseModel(statistics: Float32Array): NoiseModel {
	const model: NoiseModel = { shot: [], read: [] };
	for (let channel = 0; channel < 4; channel++) {
		const samples: { signal: number; variance: number }[] = [];
		for (let offset = channel; offset + 4 < statistics.length; offset += 8) {
			const signal = statistics[offset];
			const variance = statistics[offset + 4];
			if (
				Number.isFinite(signal) &&
				Number.isFinite(variance) &&
				signal < 0.95 &&
				variance >= 0
			) {
				samples.push({ signal: Math.max(0, signal), variance });
			}
		}
		samples.sort((a, b) => a.signal - b.signal);
		const bins: { signal: number; variance: number }[] = [];
		const width = Math.max(8, Math.ceil(samples.length / 16));
		for (let start = 0; start < samples.length; start += width) {
			const bin = samples.slice(start, start + width);
			bins.push({
				signal: median(bin.map((p) => p.signal)),
				variance: median(bin.map((p) => p.variance)),
			});
		}
		const slopes: number[] = [];
		for (let i = 0; i < bins.length; i++) {
			for (let j = i + 1; j < bins.length; j++) {
				const span = bins[j].signal - bins[i].signal;
				if (span > 1e-4) {
					slopes.push((bins[j].variance - bins[i].variance) / span);
				}
			}
		}
		// A single brightness cannot identify two parameters: use a constant variance.
		let shot = Math.max(0, median(slopes));
		const floor = Math.max(
			1e-10,
			bins.length ? Math.min(...bins.map((p) => p.variance)) * 0.1 : 0,
		);
		if (bins.length) {
			const bound = median(
				bins.map((p) => (p.variance - floor) / Math.max(p.signal, 1e-6)),
			);
			shot = Math.min(shot, Math.max(0, bound));
		}
		model.shot.push(shot);
		model.read.push(
			Math.max(floor, median(bins.map((p) => p.variance - shot * p.signal))),
		);
	}
	return model;
}

/** Smooth spatial gain for sensor noise that a single shot/read line cannot describe. */
export function fitNoiseScales(
	statistics: Float32Array,
	grid: number[],
	model: NoiseModel,
) {
	if (grid[0] < 32 || grid[1] < 32) {
		return Array.from({ length: 256 }, () => [1, 1, 1, 1]);
	}
	const ratios = Array.from({ length: statistics.length / 8 }, (_, i) => {
		const values = [0, 1, 2, 3].map(
			(c) =>
				statistics[i * 8 + 4 + c] /
				Math.max(
					1e-10,
					model.read[c] + model.shot[c] * Math.max(0, statistics[i * 8 + c]),
				),
		);
		return values.every((v) => Number.isFinite(v) && v >= 0)
			? median(values)
			: 1;
	});
	const scales = Array.from({ length: 1024 }, (_, i) => {
		const x = i % 32,
			y = Math.floor(i / 32);
		const neighbors: number[] = [];
		for (let row = Math.max(0, y - 1); row <= Math.min(31, y + 1); row++) {
			for (
				let column = Math.max(0, x - 1);
				column <= Math.min(31, x + 1);
				column++
			) {
				neighbors.push(ratios[row * 32 + column]);
			}
		}
		neighbors.sort((a, b) => a - b);
		// A local median rejects isolated texture without underestimating broad noisy areas.
		return Math.max(
			1,
			Math.min(4, neighbors[Math.floor((neighbors.length - 1) / 2)]),
		);
	});
	return Array.from({ length: 256 }, (_, i) => scales.slice(i * 4, i * 4 + 4));
}

export async function estimateNoise(
	gpu: Gpu,
	source: GPUTexture,
	params: Sensor,
) {
	const grid = params.crop
		.slice(2)
		.map((size) => Math.min(32, Math.floor(size / 32)));
	if (grid.includes(0)) {
		return {
			...fitNoiseModel(new Float32Array(0)),
			scales: Array.from({ length: 256 }, () => [1, 1, 1, 1]),
		};
	}
	const bytes = grid[0] * grid[1] * 32;
	const statistics = gpu.device.createBuffer({
		size: bytes,
		usage: ["storage", "copy_src"],
	});
	try {
		compute(gpu, shader)
			.set({ source, statistics, params: { ...params, grid } })
			.dispatch(grid[0], grid[1]);
		const samples = new Float32Array(await statistics.read(bytes));
		const model = fitNoiseModel(samples);
		return { ...model, scales: fitNoiseScales(samples, grid, model) };
	} finally {
		statistics.dispose();
	}
}
