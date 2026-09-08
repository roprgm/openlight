import { decode } from "tiff";
import { imageColor } from "./color";

async function readStrip(
	input: Uint8Array,
	output: Uint8Array,
	compression: number,
) {
	let length = 0;
	function write(chunk: Uint8Array) {
		output.set(chunk, length);
		length += chunk.length;
	}
	if (compression === 1) {
		write(input);
	} else {
		await new Blob([input.slice()])
			.stream()
			.pipeThrough(new DecompressionStream("deflate"))
			.pipeTo(new WritableStream({ write }));
	}
	if (length !== output.length) {
		throw new Error("Incorrect TIFF strip length.");
	}
}

async function decodeTiff(file: Blob) {
	if (file.size > 512_000_000) {
		throw new Error("Image exceeds the 512 MB import limit.");
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	const [header] = decode(bytes, { ignoreImageData: true, pages: [0] });
	const {
		width,
		height,
		bitsPerSample: bits,
		samplesPerPixel: channels,
		type: photo,
	} = header;
	if (header.fields.has(50706)) {
		throw new Error("DNG requires a Camera RAW loader.");
	}
	if (![1, 8, 32946].includes(header.compression)) {
		throw new Error(
			"TIFF compression is unsupported. Export uncompressed or ZIP/Deflate TIFF.",
		);
	}
	if (
		header.tiled ||
		header.planarConfiguration !== 1 ||
		(header.orientation || 1) !== 1
	) {
		throw new Error(
			"TIFF must use strips, interleaved channels and top-left orientation.",
		);
	}
	const depths: unknown = header.get(258);
	const formats: unknown = header.get(339) ?? 1;
	if (
		![8, 16].includes(bits) ||
		!(
			depths === bits ||
			(depths instanceof Uint16Array && depths.every((v) => v === bits))
		) ||
		!(
			formats === 1 ||
			(formats instanceof Uint16Array && formats.every((v) => v === 1))
		)
	) {
		throw new Error("TIFF requires 8-bit or 16-bit unsigned samples.");
	}
	const colors = photo === 2 ? 3 : 1;
	if (
		![0, 1, 2].includes(photo) ||
		!(
			channels === colors ||
			(channels === colors + 1 &&
				[1, 2].includes(header.extraSamples?.[0] ?? 0))
		) ||
		![1, 2].includes(header.predictor) ||
		header.fillOrder !== 1
	) {
		throw new Error("Unsupported TIFF color model or predictor.");
	}
	const rowBytes = (width * channels * bits) / 8;
	const size = rowBytes * height;
	if (
		!(width > 0 && height > 0) ||
		!Number.isSafeInteger(size) ||
		size > 512_000_000
	) {
		throw new Error("Image exceeds the import size limit.");
	}
	const {
		stripOffsets: offsets,
		stripByteCounts: lengths,
		rowsPerStrip: rows,
	} = header;
	if (
		!offsets ||
		!lengths ||
		offsets.length !== Math.ceil(height / rows) ||
		lengths.length !== offsets.length
	) {
		throw new Error("Invalid TIFF strip table.");
	}
	if (
		!header.fields.has(34675) &&
		[301, 318, 319].some((tag) => header.fields.has(tag))
	) {
		throw new Error(
			"Export TIFF with an embedded ICC profile for custom primaries or transfer curves.",
		);
	}
	const color = imageColor(header.get(34675));
	const data = new Uint8Array(size);
	for (let i = 0; i < offsets.length; i++) {
		const start = offsets[i];
		if (start + lengths[i] > bytes.length) {
			throw new Error("TIFF strip is outside the file.");
		}
		const at = i * rows * rowBytes;
		await readStrip(
			bytes.subarray(start, start + lengths[i]),
			data.subarray(at, Math.min(at + rows * rowBytes, size)),
			header.compression,
		);
	}
	let little = Number(bytes[0] === 73);
	if (header.predictor === 2) {
		// Prediction is a sequential sum per row; keep it in the decoding worker.
		if (bits === 16 && !little) {
			const view = new DataView(data.buffer);
			for (let i = 0; i < data.length; i += 2) {
				view.setUint16(i, view.getUint16(i), true);
			}
		}
		const samples = bits === 8 ? data : new Uint16Array(data.buffer);
		const row = width * channels;
		for (let y = 0; y < samples.length; y += row) {
			for (let x = channels; x < row; x++) {
				samples[y + x] += samples[y + x - channels];
			}
		}
		little = 1;
	}
	return {
		width,
		height,
		bits,
		channels,
		photo,
		little,
		alpha: Number(header.associatedAlpha),
		data,
		...color,
	};
}

export type Raster = Awaited<ReturnType<typeof decodeTiff>>;

self.onmessage = async ({ data }: MessageEvent<Blob>) => {
	try {
		const image = await decodeTiff(data);
		self.postMessage(image, {
			transfer: [image.data.buffer, image.curves.buffer],
		});
	} catch (error) {
		self.postMessage({ error: String(error) });
	}
};
