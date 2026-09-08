import type { Buffer } from "@vgpu/core";
import {
	type Compute,
	compute,
	type Effect,
	effect,
	frame,
	type Gpu,
	type Target,
	target,
} from "vgpu";
import blitShader from "./blit.wgsl";
import inflateShader from "./inflate.wgsl";
import lzwShader from "./lzw.wgsl";
import { offsetsOf, type Prepared, rowBytes } from "./prepare";
import unpackShader from "./unpack.wgsl";

export type UploadOptions = {
	/** Largest buffer to bind, in bytes; defaults to the device limits. */
	limit?: number;
	/** Target format; `rgba32float` keeps raw sample values exact. */
	format?: "rgba16float" | "rgba32float";
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

/**
 * writeBuffer takes multiples of 4: over-read up to 3 bytes of `data`, or pad at its end. Offsets are
 * passed explicitly because the Node WebGPU binding ignores a typed array view's byte offset.
 */
function writeBytes(
	gpu: Gpu,
	target: Buffer,
	data: Uint8Array<ArrayBuffer>,
	start: number,
	end: number,
	at: number,
) {
	const stop = Math.min(align(end), data.byteLength);
	const whole = stop - ((stop - start) & 3);
	gpu.gpu.queue.writeBuffer(
		target.gpu,
		at,
		data.buffer,
		data.byteOffset + start,
		whole - start,
	);
	if (whole < end) {
		const tail = new Uint8Array(4);
		tail.set(data.subarray(whole, end));
		target.write(tail, at + whole - start);
	}
}

const pipelines = new WeakMap<
	Gpu,
	{ codecs: Record<number, Compute>; unpack: Compute; blit: Effect }
>();

/**
 * Row bands that fit the buffer limit, with entries in plane, chunk row, column order: whole chunks,
 * expanded in full so no codec phrase is cut at the image edge, while the GPU still has to expand
 * them, otherwise any run of rows.
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
							encoded ? chunkHeight : Math.min(end, top + chunkHeight) - top,
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

/** Expands LZW or Deflate where needed and unpacks samples on the GPU, one row band at a time, into a linear rgba16float target. */
export function uploadTiff(
	gpu: Gpu,
	prepared: Prepared,
	options: UploadOptions = {},
): Target {
	const { info, data, encoded } = prepared;
	const device = gpu.device;
	const shaders = pipelines.get(gpu) ?? {
		// GPU codecs by compression code; a RAW loader adds lossless JPEG here.
		codecs: {
			5: compute(gpu, lzwShader),
			8: compute(gpu, inflateShader),
			32946: compute(gpu, inflateShader),
		},
		unpack: compute(gpu, unpackShader),
		blit: effect(gpu, blitShader),
	};
	pipelines.set(gpu, shaders);
	const { width, height, orientation } = info;
	const limit = Math.min(
		options.limit ?? Number.POSITIVE_INFINITY,
		device.limits.maxStorageBufferBindingSize,
		device.limits.maxBufferSize,
	);
	const planes = info.planar === 2 ? info.samplesPerPixel : 1;
	const transposed = orientation >= 5;
	const flipped = [3, 4, 6, 7].includes(orientation);
	const wide = options.format === "rgba32float";
	const image = target(gpu, {
		size: transposed ? [height, width] : [width, height],
		format: wide ? "rgba32float" : "rgba16float",
	});
	const colorMap = device.createBuffer({
		size: Math.max(4, (info.colorMap?.length ?? 0) * 4),
		usage: ["storage", "copy_dst"],
	});
	if (info.colorMap) {
		colorMap.write(Uint32Array.from(info.colorMap));
	}
	const curves = device.createBuffer({
		size: prepared.curves.byteLength,
		usage: ["storage", "copy_dst"],
	});
	curves.write(prepared.curves);
	const params = {
		width,
		height,
		samples: info.samplesPerPixel,
		colors: info.photometric === 2 ? 3 : 1,
		bits: info.bitsPerSample,
		littleEndian: Number(info.littleEndian),
		float: Number(info.sampleFormat === 3),
		whiteIsZero: Number(info.photometric === 0),
		planar: info.planar,
		predictor: info.predictor,
		palette: Number(info.photometric === 3),
		wide: Number(wide),
		premultiplied: Number(info.premultiplied),
		orientation,
		matrix: prepared.matrix,
	};
	bands(prepared, width * 8, limit).forEach((band, index) => {
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
			writeBytes(gpu, input, data, run.start, run.end, run.at);
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
			shaders.codecs[encoded]
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
					e.y,
					e.width,
					e.height,
				]),
			),
		);
		// The band's stored rows land in a rectangle of the oriented output.
		const along = flipped ? height - band.y - band.rows : band.y;
		const rect = transposed
			? [along, 0, band.rows, width]
			: [0, along, width, band.rows];
		const rowWords = Math.ceil((rect[2] * (wide ? 16 : 8)) / 256) * 64;
		const pixels = buffer(rowWords * 4 * rect[3], ["storage"]);
		const chunksPerPlane = band.entries.length / planes;
		const maxRows = Math.max(...band.entries.map((e) => e.height));
		shaders.unpack
			.set({
				params: {
					...params,
					chunksPerPlane,
					maxRows,
					rowWords,
					origin: [rect[0], rect[1]],
				},
				data: source,
				chunks: table,
				colorMap,
				curves,
				output: pixels,
			})
			.dispatch(Math.ceil((chunksPerPlane * maxRows) / 64));
		frame(gpu, (f) => {
			f.pass(
				{
					target: image,
					clear: index === 0,
					scissor: [rect[0], rect[1], rect[2], rect[3]],
				},
				shaders.blit.set({
					rect: { origin: [rect[0], rect[1]], rowWords, wide: Number(wide) },
					pixels,
				}),
			);
		});
		for (const b of owned) {
			b.dispose();
		}
	});
	colorMap.dispose();
	curves.dispose();
	return image;
}
