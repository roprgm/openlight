import type { Gpu, Target } from "vgpu";
import { developDng } from "@/lib/camera-raw";
import { uploadTiff } from "@/lib/tiff-gpu";
import { decodeHeic } from "./heic";
import linearize from "./linearize";
import decodeSvg from "./svg";
import type { Decoder } from "./types";
import { workerDecoder } from "./worker";

export type { Target };

/** Pair each decoder with its GPU upload while its output type is still known. */
function withUpload<T>(
	decode: Decoder<T>,
	upload: (gpu: Gpu, data: T) => Target,
) {
	return async (gpu: Gpu, file: Blob) => upload(gpu, await decode(file));
}

/** A format: how to recognize it, decode it, and turn the result into a working-space target. */
type Format = {
	types: string[];
	extensions: string[];
	decode(gpu: Gpu, file: Blob): Promise<Target>;
};

const native = withUpload((file) => createImageBitmap(file), linearize);
const svg = withUpload(decodeSvg, linearize);
const heic = withUpload(decodeHeic, linearize);
const tiff = withUpload(workerDecoder("tiff"), uploadTiff);
const dng = withUpload(workerDecoder("dng"), developDng);

const formats: Format[] = [
	{
		types: ["image/tiff", "image/x-tiff"],
		extensions: ["tif", "tiff"],
		decode: tiff,
	},
	{
		types: ["image/x-adobe-dng", "image/dng"],
		extensions: ["dng"],
		decode: dng,
	},
	{ types: ["image/png"], extensions: ["png"], decode: native },
	{ types: ["image/jpeg"], extensions: ["jpg", "jpeg"], decode: native },
	{ types: ["image/gif"], extensions: ["gif"], decode: native },
	{ types: ["image/webp"], extensions: ["webp"], decode: native },
	{ types: ["image/avif"], extensions: ["avif"], decode: native },
	{ types: ["image/bmp"], extensions: ["bmp"], decode: native },
	{ types: ["image/svg+xml"], extensions: ["svg"], decode: svg },
	{
		types: ["image/heic", "image/heif"],
		extensions: ["heic", "heif"],
		decode: heic,
	},
];

/** Matches by MIME type, then by extension for files the OS doesn't type. */
function formatOf(file: File) {
	const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
	return formats.find(
		(f) => f.types.includes(file.type) || f.extensions.includes(extension),
	);
}

/** Types and extensions `decode` accepts, for `<input accept>`. */
export const accept = formats
	.flatMap((f) => [...f.types, ...f.extensions.map((e) => `.${e}`)])
	.join(",");

export const canDecode = (file: File) => formatOf(file) !== undefined;

/** Decodes the file into a linear rgba16float target: the format's decoder, then its GPU leg. */
export default async function decode(gpu: Gpu, file: File): Promise<Target> {
	const format = formatOf(file);
	if (!format) {
		throw new Error(`Unsupported image: ${file.name}`);
	}
	return format.decode(gpu, file);
}
