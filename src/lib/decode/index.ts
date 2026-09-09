import type { Gpu, Target } from "vgpu";
import { developEditableDng } from "@/lib/camera-raw/develop";
import type { ImageSource } from "@/lib/image-source";
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
	return async (gpu: Gpu, file: Blob): Promise<ImageSource> => ({
		image: upload(gpu, await decode(file)),
	});
}

/** A format: how to recognize it, decode it, and turn the result into a working-space target. */
type Format = {
	types: string[];
	extensions: string[];
	decode(gpu: Gpu, file: Blob): Promise<ImageSource>;
};

const native = withUpload((file) => createImageBitmap(file), linearize);
const svg = withUpload(decodeSvg, linearize);
const heic = withUpload(decodeHeic, linearize);
const tiff = withUpload(workerDecoder("tiff"), uploadTiff);
const decodeDng = workerDecoder("dng");
const dng = async (gpu: Gpu, file: Blob) =>
	developEditableDng(gpu, await decodeDng(file));

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

/** Decode into a working-space image and any editing capabilities supplied by its loader. */
export default async function decode(
	gpu: Gpu,
	file: File,
): Promise<ImageSource> {
	const format = formatOf(file);
	if (!format) {
		throw new Error(`Unsupported image: ${file.name}`);
	}
	return format.decode(gpu, file);
}
