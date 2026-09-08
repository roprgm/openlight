import type { Gpu } from "vgpu";
import {
	type DecodeOptions,
	decodeTiff,
	prepareTiff,
	uploadTiff,
} from "./index";

export function mismatches(a: Float32Array, b: Float32Array) {
	let count = a.length === b.length ? 0 : Number.POSITIVE_INFINITY;
	for (let i = 0; i < a.length && count < 1e6; i++) {
		if (a[i] !== b[i]) count++;
	}
	return count;
}

const median = (values: number[]) =>
	[...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Times `prepareTiff` and `uploadTiff` per variant; the first variant is the reference the others must match. */
export async function benchmark(
	gpu: Gpu,
	buffer: ArrayBuffer,
	variants: Record<string, DecodeOptions>,
	runs = 3,
) {
	const row: Record<string, unknown> = {
		megabytes: Math.round(buffer.byteLength / 1e5) / 10,
	};
	let reference: Float32Array | undefined;
	for (const [name, options] of Object.entries(variants)) {
		const prepare: number[] = [];
		const upload: number[] = [];
		try {
			for (let i = 0; i <= runs; i++) {
				const start = performance.now();
				const prepared = await prepareTiff(buffer, options);
				const middle = performance.now();
				const image = uploadTiff(gpu, prepared, options);
				await gpu.gpu.queue.onSubmittedWorkDone();
				if (i > 0) {
					prepare.push(middle - start);
					upload.push(performance.now() - middle);
				}
				if (i === runs) {
					const output = await image.readFloats();
					row[`${name} mismatches`] = reference
						? mismatches(reference, output)
						: 0;
					reference ??= output;
				}
				image.color.dispose();
			}
			row[name] = {
				prepare: Math.round(median(prepare)),
				upload: Math.round(median(upload)),
				total: Math.round(median(prepare) + median(upload)),
			};
		} catch (error) {
			row[name] = { error: String(error) };
		}
	}
	return row;
}

/** Output size and linear rgba values at the given pixels. */
export async function decodeAt(
	gpu: Gpu,
	bytes: ArrayBuffer,
	points: { x: number; y: number }[],
	options: DecodeOptions = {},
) {
	const image = await decodeTiff(gpu, bytes, options);
	const pixels = await image.readFloats();
	const [width] = image.size;
	const values = points.map(({ x, y }) => [
		...pixels.subarray((y * width + x) * 4, (y * width + x + 1) * 4),
	]);
	const size = [...image.size];
	image.color.dispose();
	return { size, values };
}
