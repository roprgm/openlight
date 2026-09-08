import type { Texture } from "@vgpu/core";
import { compute, type Gpu, init } from "vgpu";
import {
	decodeTiff,
	type PrepareOptions,
	prepareTiff,
	type UploadOptions,
	uploadTiff,
} from "./index";
import inflateShader from "./inflate.wgsl";

/** Tight rgba16uint bytes of a texture, for comparing decoder variants. */
async function readTexture(gpu: Gpu, texture: Texture) {
	const [width, height] = texture.size;
	const rowBytes = width * 8;
	const bytesPerRow = Math.ceil(rowBytes / 256) * 256;
	const staging = gpu.device.createBuffer({
		size: bytesPerRow * height,
		usage: ["copy_dst", "copy_src"],
	});
	const encoder = gpu.gpu.createCommandEncoder();
	encoder.copyTextureToBuffer(
		{ texture: texture.gpu },
		{ buffer: staging.gpu, bytesPerRow, rowsPerImage: height },
		[width, height],
	);
	gpu.gpu.queue.submit([encoder.finish()]);
	const padded = new Uint8Array(await staging.read(bytesPerRow * height));
	staging.dispose();
	const tight = new Uint8Array(rowBytes * height);
	for (let y = 0; y < height; y++)
		tight.set(
			padded.subarray(y * bytesPerRow, y * bytesPerRow + rowBytes),
			y * rowBytes,
		);
	return tight;
}

function mismatches(a: Uint8Array, b: Uint8Array) {
	let count = a.length === b.length ? 0 : Number.POSITIVE_INFINITY;
	for (let i = 0; i < a.length && count < 1e6; i += 2) {
		if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) count++;
	}
	return count;
}

const median = (values: number[]) =>
	[...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Times `prepareTiff` and `uploadTiff` per variant on the default device limits; the first variant is the reference. */
export async function benchmark(
	urls: string[],
	variants: Record<string, PrepareOptions & UploadOptions>,
	runs = 3,
) {
	const gpu = await init();
	const results = [];
	for (const url of urls) {
		const buffer = await (await fetch(url)).arrayBuffer();
		const row: Record<string, unknown> = {
			file: url.split("/").pop(),
			megabytes: Math.round(buffer.byteLength / 1e5) / 10,
		};
		let reference: Uint8Array | undefined;
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
						const output = await readTexture(gpu, image.texture);
						row[`${name} mismatches`] = reference
							? mismatches(reference, output)
							: 0;
						reference ??= output;
					}
					image.texture.dispose();
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
		results.push(row);
	}
	gpu.dispose();
	return results;
}

/** Decoded 16-bit rgba samples at the given pixels, for tests. */
export async function samplesAt(
	url: string,
	points: { x: number; y: number }[],
) {
	const gpu = await init();
	const image = await decodeTiff(gpu, await (await fetch(url)).arrayBuffer());
	const bytes = await readTexture(gpu, image.texture);
	const samples = new Uint16Array(bytes.buffer);
	const result = points.map(({ x, y }) => [
		...samples.subarray(
			(y * image.width + x) * 4,
			(y * image.width + x + 1) * 4,
		),
	]);
	image.texture.dispose();
	gpu.dispose();
	return result;
}

/** Runs the GPU inflater on zlib streams and returns their bytes, for tests. */
export async function inflateOnGpu(
	streams: { bytes: number[]; size: number }[],
) {
	const gpu = await init();
	const align = (n: number) => (n + 3) & ~3;
	const inputs = streams.map((s) => Uint8Array.from(s.bytes));
	const input = gpu.device.createBuffer({
		size: align(inputs.reduce((n, s) => n + align(s.length), 0)),
		usage: ["storage", "copy_dst"],
	});
	const output = gpu.device.createBuffer({
		size: align(streams.reduce((n, s) => n + align(s.size), 0)),
		usage: ["storage", "copy_src"],
	});
	const jobs: number[] = [];
	let at = 0;
	let out = 0;
	for (const [i, bytes] of inputs.entries()) {
		const padded = new Uint8Array(align(bytes.length));
		padded.set(bytes);
		input.write(padded, at);
		jobs.push(at, bytes.length, out, streams[i].size);
		at += padded.length;
		out += align(streams[i].size);
	}
	const table = gpu.device.createBuffer({
		size: jobs.length * 4,
		usage: ["storage", "copy_dst"],
	});
	table.write(Uint32Array.from(jobs));
	compute(gpu, inflateShader)
		.set({ params: { count: streams.length }, input, output, jobs: table })
		.dispatch(streams.length);
	const bytes = new Uint8Array(await output.read(output.options.size));
	const results = streams.map((s, i) => [
		...bytes.subarray(jobs[i * 4 + 2], jobs[i * 4 + 2] + s.size),
	]);
	gpu.dispose();
	return results;
}
