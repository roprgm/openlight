import {
	decodeLzw,
	decodePackBits,
	inflate,
	undoFloatPrediction,
} from "./codecs";
import { type Chunk, parseTiff, type TiffInfo } from "./ifd";

export type PrepareOptions = {
	/** LZW and Deflate expand on the GPU when at least this many strips or tiles can run in parallel. */
	gpuChunks?: number;
};

/** CPU output: chunk bytes in `data`, either raw rows or LZW streams the GPU expands. */
export type Prepared = {
	info: TiffInfo;
	data: Uint8Array<ArrayBuffer>;
	/** Per chunk: offset and length in `data`, then x, y, width, height. */
	chunks: Uint32Array<ArrayBuffer>;
	/** Compression the GPU still has to expand. */
	encoded: false | "lzw" | "deflate";
};

const supported = {
	compressions: [1, 5, 8, 32946, 32773],
	bits: [1, 2, 4, 8, 16, 32, 64],
};

export function rowBytes(info: TiffInfo, width: number) {
	const stride = info.planar === 2 ? 1 : info.samplesPerPixel;
	return Math.ceil((width * stride * info.bitsPerSample) / 8);
}

function check(info: TiffInfo) {
	const { photometric, sampleFormat, compression, bitsPerSample } = info;
	if (photometric > 3 || sampleFormat === 2 || sampleFormat > 3) {
		throw new Error(
			`Unsupported TIFF color: photometric ${photometric}, sample format ${sampleFormat}.`,
		);
	}
	if (!supported.compressions.includes(compression)) {
		throw new Error(`Unsupported TIFF compression: ${compression}.`);
	}
	if (
		!supported.bits.includes(bitsPerSample) ||
		(sampleFormat === 3 && bitsPerSample < 16)
	) {
		throw new Error(`Unsupported TIFF depth: ${bitsPerSample} bits.`);
	}
}

async function forEachLimited<T>(
	items: T[],
	limit: number,
	task: (item: T, i: number) => Promise<void>,
) {
	let next = 0;
	const lanes = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (next < items.length) {
				const i = next++;
				await task(items[i], i);
			}
		},
	);
	await Promise.all(lanes);
}

export function offsetsOf(sizes: number[]) {
	let total = 0;
	return sizes.map((size) => {
		total += size;
		return total - size;
	});
}

function table(chunks: Chunk[], offsets: number[], lengths: number[]) {
	return Uint32Array.from(
		chunks.flatMap((c, i) => [
			offsets[i],
			lengths[i],
			c.x,
			c.y,
			c.width,
			c.height,
		]),
	);
}

/** Reads the directory and decodes on the CPU whatever the GPU will not: PackBits, float prediction, and files with few chunks. */
export async function prepareTiff(
	bytes: ArrayBuffer,
	options: PrepareOptions = {},
): Promise<Prepared> {
	const info = parseTiff(bytes);
	check(info);
	const { chunks, compression, predictor } = info;
	const file = new Uint8Array(bytes);
	const raw = compression === 1 && predictor !== 3;
	const parallel =
		chunks.length >= (options.gpuChunks ?? 128) && predictor !== 3;
	const encoded = !parallel
		? false
		: compression === 5
			? "lzw"
			: compression === 1
				? false
				: compression === 32773
					? false
					: "deflate";
	if (raw || encoded) {
		return {
			info,
			data: file,
			chunks: table(
				chunks,
				chunks.map((c) => c.offset),
				chunks.map((c) => c.length),
			),
			encoded,
		};
	}
	const sizes = chunks.map((c) => rowBytes(info, c.width) * c.height);
	const offsets = offsetsOf(sizes);
	const data = new Uint8Array(sizes.reduce((total, size) => total + size, 3));
	await forEachLimited(chunks, 64, async (chunk, i) => {
		const input = file.subarray(chunk.offset, chunk.offset + chunk.length);
		const output = data.subarray(offsets[i], offsets[i] + sizes[i]);
		if (compression === 5) {
			decodeLzw(input, output);
		} else if (compression === 32773) {
			decodePackBits(input, output);
		} else if (compression === 1) {
			output.set(input.subarray(0, output.length));
		} else {
			await inflate(input, output);
		}
		if (predictor === 3) {
			const stride = info.planar === 2 ? 1 : info.samplesPerPixel;
			undoFloatPrediction(
				output,
				rowBytes(info, chunk.width),
				stride,
				info.bitsPerSample / 8,
				info.littleEndian,
			);
		}
	});
	return {
		info: { ...info, predictor: predictor === 3 ? 1 : predictor },
		data,
		chunks: table(chunks, offsets, sizes),
		encoded: false,
	};
}
