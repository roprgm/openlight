import libheif from "libheif-js/libheif-wasm/libheif.js";
import wasm from "libheif-js/libheif-wasm/libheif.wasm?url";
import type { Pixels } from "./types";

const heif = fetch(wasm)
	.then((response) => response.arrayBuffer())
	.then((wasmBinary) => libheif({ wasmBinary }));

async function decodeHeic(file: Blob): Promise<Pixels> {
	const decoder = new (await heif).HeifDecoder();
	const [image] = decoder.decode(new Uint8Array(await file.arrayBuffer()));
	if (!image) {
		throw new Error("No image in HEIF file");
	}
	const width = image.get_width();
	const height = image.get_height();
	const data = new Uint8ClampedArray(width * height * 4);
	const done = await new Promise((resolve) =>
		image.display({ data, width, height }, resolve),
	);
	image.free();
	if (!done) {
		throw new Error("HEIF decoding failed");
	}
	return { width, height, data };
}

addEventListener("message", ({ data: file }: MessageEvent<Blob>) =>
	decodeHeic(file).then(
		(pixels) => postMessage(pixels, { transfer: [pixels.data.buffer] }),
		(error) => postMessage({ error: String(error) }),
	),
);
