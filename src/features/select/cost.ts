// Shared by the GPU preview (uniforms) and the exact grow. T is a path budget.
export const EDGE_WEIGHT = 2;
export const TEXTURE_WEIGHT = 8;
export const DEFAULT_TOLERANCE = 0.32;

export type Affinity = {
	width: number;
	height: number;
	/** RGBA = OKLab and local luminance variance, read from rgba16float. */
	lab: Float32Array;
	edge: Float32Array;
};
export type SelectionOptions = {
	tolerance: number;
	contiguous: boolean;
	sampleSize: 1 | 3 | 5;
	feather: number;
};
export type Operation = "replace" | "add" | "subtract" | "intersect";
export const defaultOptions: SelectionOptions = {
	tolerance: DEFAULT_TOLERANCE,
	contiguous: true,
	sampleSize: 3,
	feather: 1,
};

export function colorDistance(
	lab: Float32Array,
	i: number,
	color: ArrayLike<number>,
) {
	return Math.hypot(
		lab[i * 4] - color[0],
		lab[i * 4 + 1] - color[1],
		lab[i * 4 + 2] - color[2],
	);
}

export function neighborCost(field: Affinity, i: number, j: number) {
	return (
		Math.hypot(
			field.lab[i * 4] - field.lab[j * 4],
			field.lab[i * 4 + 1] - field.lab[j * 4 + 1],
			field.lab[i * 4 + 2] - field.lab[j * 4 + 2],
		) +
		EDGE_WEIGHT * Math.max(field.edge[i], field.edge[j]) +
		TEXTURE_WEIGHT * Math.abs(field.lab[i * 4 + 3] - field.lab[j * 4 + 3])
	);
}

export function sampleSeed(field: Affinity, seed: number, size: number) {
	const radius = Math.floor(size / 2);
	const color = [0, 0, 0];
	for (let y = -radius; y <= radius; y++) {
		for (let x = -radius; x <= radius; x++) {
			const px = Math.max(
				0,
				Math.min(field.width - 1, (seed % field.width) + x),
			);
			const py = Math.max(
				0,
				Math.min(field.height - 1, Math.floor(seed / field.width) + y),
			);
			const i = (py * field.width + px) * 4;
			for (let c = 0; c < 3; c++) color[c] += field.lab[i + c] / (size * size);
		}
	}
	return color;
}
