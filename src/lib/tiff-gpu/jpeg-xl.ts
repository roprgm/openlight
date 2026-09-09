import type { Chunk, TiffInfo } from "./ifd";
import createDecoder, { type Decoder } from "./jpeg-xl/decoder.js";

let decoder: Promise<Decoder> | undefined;
function loadDecoder() {
	decoder ??= fetch(new URL("./jpeg-xl/decoder.wasm", import.meta.url))
		.then((response) => {
			if (!response.ok) throw Error("Could not load the JPEG XL decoder.");
			return response.arrayBuffer();
		})
		.then((wasmBinary) => createDecoder({ wasmBinary }))
		.catch((error) => {
			decoder = undefined;
			throw error;
		});
	return decoder;
}

/** Worker-local WASM instance, loaded on demand. Each synchronous decode frees its temporary buffers. */
export async function decodeJpegXL(
	input: Uint8Array<ArrayBuffer>,
	output: Uint8Array,
	context: { image: TiffInfo; chunk: Chunk },
) {
	const { image, chunk } = context;
	const floating = image.sampleFormat === 3;
	// DNG uses the JPEG XL storage range; its TIFF bit depth may describe compacted samples.
	const raw = image.photometric >= 32803;
	if (
		![1, 3].includes(image.samplesPerPixel) ||
		image.predictor !== 1 ||
		(floating
			? image.bitsPerSample !== 16
			: image.bitsPerSample < 8 || image.bitsPerSample > 16)
	) {
		throw Error("Unsupported JPEG XL TIFF sample layout.");
	}
	const wasm = await loadDecoder();
	const source = wasm._malloc(input.byteLength);
	const destination = wasm._malloc(output.byteLength);
	try {
		if (!source || !destination)
			throw Error("Not enough memory to decode JPEG XL.");
		wasm.HEAPU8.set(input, source);
		const result = wasm._decode(
			source,
			input.byteLength,
			destination,
			output.byteLength,
			chunk.width,
			chunk.height,
			image.planar === 2 ? 1 : image.samplesPerPixel,
			Number(raw),
			Number(floating),
		);
		if (result !== 0)
			throw Error(
				result === 3
					? "JPEG XL tile does not match its TIFF dimensions or channels."
					: "Invalid or incomplete JPEG XL tile.",
			);
		output.set(
			wasm.HEAPU8.subarray(destination, destination + output.byteLength),
		);
	} finally {
		wasm._free(destination);
		wasm._free(source);
	}
}
