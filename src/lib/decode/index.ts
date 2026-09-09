import type { Gpu, Target } from "vgpu";
import { createImageSource, type ImageSource } from "@/lib/image-source";
import { decodeRaw } from "@/lib/raw";
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
	load: () => Promise<Decoder>;
};

const native = async () => createImageBitmap;
const svg = async () => decodeSvg;
const heic = async () => decodeHeic;
const tiff = workerDecoder(() => import("./tiff.worker?worker"));

const formats: Format[] = [
	{
		types: ["image/tiff", "image/x-tiff"],
		extensions: ["tif", "tiff"],
		load: tiff,
	},
	{ types: ["image/png"], extensions: ["png"], load: native },
	{ types: ["image/jpeg"], extensions: ["jpg", "jpeg"], load: native },
	{ types: ["image/gif"], extensions: ["gif"], load: native },
	{ types: ["image/webp"], extensions: ["webp"], load: native },
	{ types: ["image/avif"], extensions: ["avif"], load: native },
	{ types: ["image/bmp"], extensions: ["bmp"], load: native },
	{ types: ["image/svg+xml"], extensions: ["svg"], load: svg },
	{
		types: ["image/heic", "image/heif"],
		extensions: ["heic", "heif"],
		load: heic,
	},
];

const rawExtensions = [
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
];
const isRaw = (file: File) =>
	rawExtensions.includes(file.name.split(".").pop()?.toLowerCase() ?? "") ||
	["image/x-adobe-dng", "image/dng"].includes(file.type);

/** Matches by MIME type, then by extension for files the OS doesn't type. */
function formatOf(file: File) {
	const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
	return formats.find(
		(f) => f.types.includes(file.type) || f.extensions.includes(extension),
	);
}

/** Types and extensions `decode` accepts, for `<input accept>`. */
export const accept = [
	...formats.flatMap((f) => [...f.types, ...f.extensions.map((e) => `.${e}`)]),
	...rawExtensions.map((extension) => `.${extension}`),
].join(",");

export const canDecode = (file: File) =>
	isRaw(file) || formatOf(file) !== undefined;

/** Decodes the file into a linear rgba16float target: the format's decoder, then its GPU leg. */
export default async function decode(
	gpu: Gpu,
	file: File,
): Promise<ImageSource> {
	if (isRaw(file)) {
		return decodeRaw(gpu, file);
	}
	const format = formatOf(file);
	if (!format) {
		throw new Error(`Unsupported image: ${file.name}`);
	}
	const decoder = await format.load();
	const decoded = await decoder(file);
	return createImageSource(
		"chunks" in decoded ? uploadTiff(gpu, decoded) : linearize(gpu, decoded),
	);
}
