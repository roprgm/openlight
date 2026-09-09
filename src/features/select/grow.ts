import {
	type Affinity,
	colorDistance,
	neighborCost,
	type SelectionOptions,
	sampleSeed,
} from "./cost";

/** Indexed min-heap: each pixel occupies at most one slot, including on a flat sky. */
function frontier(costs: Float64Array) {
	const pixels = new Int32Array(costs.length);
	const positions = new Int32Array(costs.length).fill(-1);
	let size = 0;
	function put(pixel: number) {
		let at = positions[pixel];
		if (at < 0) at = size++;
		while (at > 0) {
			const parent = (at - 1) >> 1;
			if (costs[pixels[parent]] <= costs[pixel]) break;
			pixels[at] = pixels[parent];
			positions[pixels[at]] = at;
			at = parent;
		}
		pixels[at] = pixel;
		positions[pixel] = at;
	}
	function take() {
		if (!size) return -1;
		const first = pixels[0];
		const last = pixels[--size];
		let at = 0;
		while (at * 2 + 1 < size) {
			let child = at * 2 + 1;
			if (child + 1 < size && costs[pixels[child + 1]] < costs[pixels[child]])
				child++;
			if (costs[last] <= costs[pixels[child]]) break;
			pixels[at] = pixels[child];
			positions[pixels[at]] = at;
			at = child;
		}
		if (size) {
			pixels[at] = last;
			positions[last] = at;
		}
		positions[first] = -1;
		return first;
	}
	return { put, take };
}

/** Exact Dijkstra on the same four-neighbor cost field as preview; yields for UI/cancellation. */
export function* grow(
	field: Affinity,
	seed: number,
	options: SelectionOptions,
): Generator<void, Float32Array> {
	const count = field.width * field.height;
	const mask = new Float32Array(count);
	const color = sampleSeed(field, seed, options.sampleSize);
	if (!options.contiguous) {
		for (let i = 0; i < count; i++) {
			mask[i] = Number(colorDistance(field.lab, i, color) < options.tolerance);
			if (i % 8192 === 8191) yield;
		}
		return mask;
	}
	const costs = new Float64Array(count).fill(Number.POSITIVE_INFINITY);
	const queue = frontier(costs);
	costs[seed] = colorDistance(field.lab, seed, color);
	if (costs[seed] < options.tolerance) queue.put(seed);
	let visited = 0;
	for (let i = queue.take(); i !== -1; i = queue.take()) {
		mask[i] = 1;
		const x = i % field.width;
		const neighbors = [
			x > 0 ? i - 1 : -1,
			x + 1 < field.width ? i + 1 : -1,
			i - field.width,
			i + field.width,
		];
		for (const j of neighbors) {
			if (j < 0 || j >= count || mask[j]) continue;
			const cost = costs[i] + neighborCost(field, i, j);
			if (cost < options.tolerance && cost < costs[j]) {
				costs[j] = cost;
				queue.put(j);
			}
		}
		if (++visited % 8192 === 0) yield;
	}
	return mask;
}
