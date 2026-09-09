import type { Gpu, Target } from "vgpu";
import { createImageSource, type ImageSource } from "@/lib/image-source";
import { uploadTiff } from "@/lib/tiff-gpu";
import { decodeHeic } from "./heic";
import linearize from "./linearize";
import decodeSvg from "./svg";
import type { Decoded, Decoder } from "./types";

export type { Target };

/** Decoder backed by a worker module: post the file, receive transferred pixels or an error. */
export function workerDecoder(
	load: () => Promise<{ default: new () => Worker }>,
) {
	return async (): Promise<Decoder> => {
		const { default: Spawn } = await load();
		return (file) =>
			new Promise((resolve, reject) => {
				const worker = new Spawn();
				worker.onmessage = ({
					data,
				}: MessageEvent<Decoded | { error: string }>) => {
					"error" in data ? reject(new Error(data.error)) : resolve(data);
					worker.terminate();
				};
				worker.postMessage(file);
			});
	};
}

type Format = {
	types: string[];
	extensions: string[];
	decode: (gpu: Gpu, file: File) => Promise<ImageSource>;
};

/** A format whose decoder yields pixels needing the GPU leg into the working space. */
function pixelFormat(load: () => Promise<Decoder>) {
	return async (gpu: Gpu, file: File) => {
		const decoder = await load();
		const decoded = await decoder(file);
		return createImageSource(
			"chunks" in decoded ? uploadTiff(gpu, decoded) : linearize(gpu, decoded),
		);
	};
}

const native = pixelFormat(async () => createImageBitmap);
const svg = pixelFormat(async () => decodeSvg);
const heic = pixelFormat(async () => decodeHeic);
const tiff = pixelFormat(workerDecoder(() => import("./tiff.worker?worker")));
const raw = async (gpu: Gpu, file: File) =>
	(await import("@/lib/raw")).decodeRaw(gpu, file);

const formats: Format[] = [
	{
		types: ["image/x-adobe-dng", "image/dng"],
		extensions: [
			"dng",
			"cr2",
			"cr3",
			"crw",
			"nef",
			"nrw",
			"arw",
			"sr2",
			"srf",
			"raf",
			"orf",
			"rw2",
			"raw",
			"rwl",
			"pef",
			"ptx",
			"srw",
			"3fr",
			"fff",
			"iiq",
			"kdc",
			"dcr",
			"mos",
			"mef",
			"erf",
			"mrw",
			"x3f",
		],
		decode: raw,
	},
	{
		types: ["image/tiff", "image/x-tiff"],
		extensions: ["tif", "tiff"],
		decode: tiff,
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
