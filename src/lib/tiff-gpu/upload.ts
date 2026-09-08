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
import { type Prepared, rowBytes } from "./prepare";
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
};
type Band = { y: number; rows: number; entries: Entry[] };

const align = (n: number) => (n + 3) & ~3;
const pipelines = new WeakMap<Gpu, { unpack: Compute; blit: Effect }>();

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

/** Row bands that fit the buffer limit, each listing the rows it takes from every chunk in plane, chunk row, column order. */
function bands(prepared: Prepared, bytesPerRow: number, limit: number): Band[] {
	const { info, chunks } = prepared;
	const { height, across, chunkHeight } = info;
	const planes = info.planar === 2 ? info.samplesPerPixel : 1;
	const perPlane = chunks.length / 6 / planes;
	const rowInput = planes * across * rowBytes(info, chunks[4]);
	const rowsPerBand = Math.floor(limit / Math.max(bytesPerRow, rowInput));
	if (rowsPerBand < 1) {
		throw new Error("TIFF row exceeds the GPU buffer limit.");
	}
	const result: Band[] = [];
	for (let y = 0; y < height; y += rowsPerBand) {
		const end = Math.min(y + rowsPerBand, height);
		const entries: Entry[] = [];
		for (let p = 0; p < planes; p++) {
			for (let j = Math.floor(y / chunkHeight); j * chunkHeight < end; j++) {
				const top = j * chunkHeight;
				const from = Math.max(y, top) - top;
				const to = Math.min(end, top + chunkHeight) - top;
				for (let i = 0; i < across; i++) {
					const at = (p * perPlane + j * across + i) * 6;
					const [offset, , x, chunkY, width] = chunks.subarray(at, at + 5);
					const bytes = rowBytes(info, width);
					entries.push({
						offset: offset + from * bytes,
						length: (to - from) * bytes,
						x,
						y: chunkY + from,
						width,
						height: to - from,
					});
				}
			}
		}
		result.push({ y, rows: end - y, entries });
	}
	return result;
}

/** Unpacks the prepared rows on the GPU, one band at a time, into a linear target of the oriented size. */
export function uploadTiff(
	gpu: Gpu,
	prepared: Prepared,
	options: UploadOptions = {},
): Target {
	const { info, data } = prepared;
	const device = gpu.device;
	const shaders = pipelines.get(gpu) ?? {
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
	bands(prepared, width * (wide ? 16 : 8), limit).forEach((band, index) => {
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
		const input = device.createBuffer({
			size: align(last ? last.at + last.end - last.start : 0),
			usage: ["storage", "copy_dst"],
		});
		for (const run of runs) {
			writeBytes(gpu, input, data, run.start, run.end, run.at);
		}
		const table = device.createBuffer({
			size: band.entries.length * 24,
			usage: ["storage", "copy_dst"],
		});
		table.write(
			Uint32Array.from(
				band.entries.flatMap((e, i) => [
					packed[i],
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
		const pixels = device.createBuffer({
			size: rowWords * 4 * rect[3],
			usage: ["storage"],
		});
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
				data: input,
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
		for (const buffer of [input, table, pixels]) {
			buffer.dispose();
		}
	});
	colorMap.dispose();
	curves.dispose();
	return image;
}
