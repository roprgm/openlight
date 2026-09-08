import { codecs, undoFloatPrediction } from "./codecs";
import { type ColorSpace, colorOf } from "./color";
import { type Chunk, parseTiff, type TiffInfo } from "./ifd";

export type PrepareOptions = {
	/** Linear RGB primaries of the output; Rec.2020 by default, which holds every photo gamut. `none` keeps sample values as they are. */
	colorSpace?: ColorSpace | "none";
	/** Layout to decode instead of the file's first image, such as a SubIFD. */
	image?: TiffInfo;
};

/** CPU output: raw rows of every chunk in `data`, with the color conversion the GPU applies. */
export type Prepared = {
	info: TiffInfo;
	data: Uint8Array<ArrayBuffer>;
	/** Per chunk: offset and length in `data`, then x, y, width, height. */
	chunks: Uint32Array<ArrayBuffer>;
	/** Transfer curves sampled over 0..1, three channels, and the matrix into the output primaries. */
	curves: Float32Array<ArrayBuffer>;
	matrix: number[];
};

/** Photometric interpretations the unpack pass understands: gray, RGB, palette, and TIFF/EP sensor mosaics. */
const photometrics = [0, 1, 2, 3, 32803, 34892];

export function rowBytes(info: TiffInfo, width: number) {
	const stride = info.planar === 2 ? 1 : info.samplesPerPixel;
	return Math.ceil((width * stride * info.bitsPerSample) / 8);
}

/** Samples that are already linear light: floats and sensor data. */
export const isLinear = (info: TiffInfo) =>
	info.sampleFormat === 3 || info.photometric >= 32803;

function check(info: TiffInfo) {
	const { photometric, sampleFormat, compression, bitsPerSample } = info;
	if (
		!photometrics.includes(photometric) ||
		sampleFormat === 2 ||
		sampleFormat > 3
	) {
		throw new Error(
			`Unsupported TIFF color: photometric ${photometric}, sample format ${sampleFormat}.`,
		);
	}
	if (!(compression in codecs)) {
		throw new Error(`Unsupported TIFF compression: ${compression}.`);
	}
	if (
		bitsPerSample < 1 ||
		bitsPerSample > 64 ||
		(bitsPerSample > 32 && bitsPerSample < 64) ||
		(sampleFormat === 3 && ![16, 32, 64].includes(bitsPerSample))
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

/** Reads the layout, resolves the color, and decompresses every chunk; uncompressed files are used in place. */
export async function prepareTiff(
	bytes: ArrayBuffer,
	options: PrepareOptions = {},
): Promise<Prepared> {
	const info = options.image ?? parseTiff(bytes);
	check(info);
	const { chunks, compression, predictor } = info;
	const { table: curves, matrix } = colorOf(
		info.icc,
		isLinear(info),
		options.colorSpace ?? "rec2020",
	);
	const file = new Uint8Array(bytes);
	if (compression === 1 && predictor !== 3) {
		return {
			info,
			data: file,
			chunks: table(
				chunks,
				chunks.map((c) => c.offset),
				chunks.map((c) => c.length),
			),
			curves,
			matrix,
		};
	}
	const decode = codecs[compression];
	const sizes = chunks.map((c) => rowBytes(info, c.width) * c.height);
	const offsets = offsetsOf(sizes);
	const data = new Uint8Array(sizes.reduce((total, size) => total + size, 3));
	await forEachLimited(chunks, 64, async (chunk, i) => {
		const input = file.subarray(chunk.offset, chunk.offset + chunk.length);
		const output = data.subarray(offsets[i], offsets[i] + sizes[i]);
		await decode(input, output);
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
		curves,
		matrix,
	};
}
