import type { Buffer, Texture } from "@vgpu/core";
import { compute, type Gpu } from "vgpu";
import inflateShader from "./inflate.wgsl";
import lzwShader from "./lzw.wgsl";
import { offsetsOf, type Prepared, rowBytes } from "./prepare";
import unpackShader from "./unpack.wgsl";

export type UploadOptions = {
	/** Largest buffer to bind, in bytes; defaults to the device limits. */
	limit?: number;
};

/** Scaled samples in an `rgba16uint` texture, plus what a consumer needs to interpret them. */
export type TiffTexture = {
	texture: Texture;
	width: number;
	height: number;
	/** Samples are float16 bit patterns instead of 16-bit integers. */
	float: boolean;
	premultiplied: boolean;
	orientation: number;
	icc?: Uint8Array;
};

type Entry = {
	offset: number;
	length: number;
	x: number;
	y: number;
	width: number;
	height: number;
	decoded: number;
};
type Band = {
	y: number;
	rows: number;
	input: number;
	decoded: number;
	entries: Entry[];
};

const align = (n: number) => (n + 3) & ~3;

/** writeBuffer takes multiples of 4: over-read up to 3 bytes of `data`, or pad at its end. */
function writeBytes(
	target: Buffer,
	data: Uint8Array<ArrayBuffer>,
	start: number,
	end: number,
	at: number,
) {
	const stop = Math.min(align(end), data.byteLength);
	const whole = stop - ((stop - start) & 3);
	target.write(data.subarray(start, whole), at);
	if (whole < end) {
		const tail = new Uint8Array(4);
		tail.set(data.subarray(whole, end));
		target.write(tail, at + whole - start);
	}
}
const pipelines = new WeakMap<
	Gpu,
	Record<"lzw" | "deflate" | "unpack", ReturnType<typeof compute>>
>();

/**
 * Row bands that fit the buffer limit, with entries in plane, chunk row, column order: whole chunks
 * while the GPU still has to expand them, otherwise any run of rows.
 */
function bands(prepared: Prepared, bytesPerRow: number, limit: number): Band[] {
	const { info, chunks, encoded } = prepared;
	const { height, across, chunkHeight } = info;
	const planes = info.planar === 2 ? info.samplesPerPixel : 1;
	const perPlane = chunks.length / 6 / planes;
	const groups = perPlane / across;
	const entry = (i: number, from: number, to: number): Entry => {
		const [offset, length, x, y, width] = chunks.subarray(i * 6, i * 6 + 5);
		const bytes = rowBytes(info, width);
		return encoded
			? { offset, length, x, y, width, height: to, decoded: bytes * to }
			: {
					offset: offset + from * bytes,
					length: (to - from) * bytes,
					x,
					y: y + from,
					width,
					height: to - from,
					decoded: (to - from) * bytes,
				};
	};
	const entriesFor = (from: number, to: number, y: number, end: number) => {
		const entries: Entry[] = [];
		for (let p = 0; p < planes; p++) {
			for (let j = from; j < to; j++) {
				const top = j * chunkHeight;
				for (let i = 0; i < across; i++) {
					entries.push(
						entry(
							p * perPlane + j * across + i,
							Math.max(y, top) - top,
							Math.min(end, top + chunkHeight) - top,
						),
					);
				}
			}
		}
		return entries;
	};
	const band = (y: number, rows: number, entries: Entry[]): Band => ({
		y,
		rows,
		entries,
		input: entries.reduce((n, e) => n + align(e.length), 0),
		decoded: entries.reduce((n, e) => n + align(e.decoded), 0),
	});
	const fits = (b: Band) =>
		b.input <= limit && b.decoded <= limit && b.rows * bytesPerRow <= limit;
	const result: Band[] = [];
	if (encoded) {
		for (let from = 0; from < groups; ) {
			let to = from + 1;
			let current = band(
				from * chunkHeight,
				Math.min(chunkHeight, height - from * chunkHeight),
				entriesFor(from, to, 0, height),
			);
			for (; to < groups; to++) {
				const grown = band(
					current.y,
					Math.min((to + 1) * chunkHeight, height) - current.y,
					entriesFor(from, to + 1, 0, height),
				);
				if (!fits(grown)) break;
				current = grown;
			}
			result.push(current);
			from = to;
		}
	} else {
		const rowInput = planes * across * rowBytes(info, chunks[4]);
		const rowsPerBand = Math.max(
			1,
			Math.floor(limit / Math.max(bytesPerRow, rowInput)),
		);
		for (let y = 0; y < height; y += rowsPerBand) {
			const end = Math.min(y + rowsPerBand, height);
			result.push(
				band(
					y,
					end - y,
					entriesFor(
						Math.floor(y / chunkHeight),
						Math.ceil(end / chunkHeight),
						y,
						end,
					),
				),
			);
		}
	}
	if (!result.every(fits)) {
		throw new Error("TIFF chunk exceeds the GPU buffer limit.");
	}
	return result;
}

/** Expands LZW where needed and unpacks samples on the GPU, one row band at a time, into a new texture. */
export function uploadTiff(
	gpu: Gpu,
	prepared: Prepared,
	options: UploadOptions = {},
): TiffTexture {
	const { info, data, encoded } = prepared;
	const device = gpu.device;
	const shaders = pipelines.get(gpu) ?? {
		lzw: compute(gpu, lzwShader),
		deflate: compute(gpu, inflateShader),
		unpack: compute(gpu, unpackShader),
	};
	pipelines.set(gpu, shaders);
	const { width, height } = info;
	const limit = Math.min(
		options.limit ?? Number.POSITIVE_INFINITY,
		device.limits.maxStorageBufferBindingSize,
		device.limits.maxBufferSize,
	);
	const bytesPerRow = Math.ceil((width * 8) / 256) * 256;
	const planes = info.planar === 2 ? info.samplesPerPixel : 1;
	const texture = device.createTexture({
		size: [width, height],
		format: "rgba16uint",
		usage: ["texture_binding", "copy_dst", "copy_src"],
	});
	const colorMap = device.createBuffer({
		size: Math.max(4, (info.colorMap?.length ?? 0) * 4),
		usage: ["storage", "copy_dst"],
	});
	if (info.colorMap) {
		colorMap.write(Uint32Array.from(info.colorMap));
	}
	const params = {
		width,
		height: 0,
		samples: info.samplesPerPixel,
		colors: info.photometric === 2 ? 3 : 1,
		bits: info.bitsPerSample,
		littleEndian: Number(info.littleEndian),
		float: Number(info.sampleFormat === 3),
		whiteIsZero: Number(info.photometric === 0),
		planar: info.planar,
		predictor: info.predictor,
		palette: Number(info.photometric === 3),
		chunksPerPlane: 0,
		maxRows: 0,
		rowWords: bytesPerRow / 4,
	};
	for (const band of bands(prepared, bytesPerRow, limit)) {
		const owned: Buffer[] = [];
		const buffer = (
			size: number,
			usage: ("storage" | "copy_dst" | "copy_src")[],
		) => {
			const created = device.createBuffer({ size: align(size), usage });
			owned.push(created);
			return created;
		};
		// Chunk bytes packed together: contiguous runs upload with one write, each starting 4-byte aligned.
		const runs: { start: number; end: number; at: number }[] = [];
		const packed = band.entries.map((entry) => {
			let run = runs.at(-1);
			if (!run || entry.offset !== run.end) {
				run = {
					start: entry.offset,
					end: entry.offset,
					at: align(run ? run.at + run.end - run.start : 0),
				};
				runs.push(run);
			}
			run.end += entry.length;
			return run.at + entry.offset - run.start;
		});
		const last = runs.at(-1);
		const input = buffer(last ? last.at + last.end - last.start : 0, [
			"storage",
			"copy_dst",
		]);
		for (const run of runs) {
			writeBytes(input, data, run.start, run.end, run.at);
		}
		let source = input;
		let offsets = packed;
		if (encoded) {
			source = buffer(band.decoded, ["storage", "copy_dst"]);
			offsets = offsetsOf(band.entries.map((e) => align(e.decoded)));
			const jobs = buffer(band.entries.length * 16, ["storage", "copy_dst"]);
			jobs.write(
				Uint32Array.from(
					band.entries.flatMap((e, i) => [
						packed[i],
						e.length,
						offsets[i],
						e.decoded,
					]),
				),
			);
			shaders[encoded]
				.set({
					params: { count: band.entries.length },
					input,
					output: source,
					jobs,
				})
				.dispatch(band.entries.length);
		}
		const table = buffer(band.entries.length * 24, ["storage", "copy_dst"]);
		table.write(
			Uint32Array.from(
				band.entries.flatMap((e, i) => [
					offsets[i],
					e.length,
					e.x,
					e.y - band.y,
					e.width,
					e.height,
				]),
			),
		);
		const pixels = buffer(band.rows * bytesPerRow, ["storage", "copy_src"]);
		const chunksPerPlane = band.entries.length / planes;
		const maxRows = Math.max(...band.entries.map((e) => e.height));
		shaders.unpack
			.set({
				params: { ...params, height: band.rows, chunksPerPlane, maxRows },
				data: source,
				chunks: table,
				colorMap,
				output: pixels,
			})
			.dispatch(Math.ceil((chunksPerPlane * maxRows) / 64));
		const encoder = gpu.gpu.createCommandEncoder();
		encoder.copyBufferToTexture(
			{ buffer: pixels.gpu, bytesPerRow, rowsPerImage: band.rows },
			{ texture: texture.gpu, origin: [0, band.y] },
			[width, band.rows],
		);
		gpu.gpu.queue.submit([encoder.finish()]);
		for (const b of owned) {
			b.dispose();
		}
	}
	colorMap.dispose();
	return {
		texture,
		width,
		height,
		float: info.sampleFormat === 3,
		premultiplied: info.premultiplied,
		orientation: info.orientation,
		icc: info.icc,
	};
}
