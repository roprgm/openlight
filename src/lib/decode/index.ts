import type { Gpu, Target } from "vgpu";
import { decodeHeic } from "./heic";
import linearize from "./linearize";
import decodeSvg from "./svg";
import type { Decoder } from "./types";

export { workerDecoder } from "./worker-decoder";
export type { Target };

type Format = {
	types: string[];
	extensions: string[];
	load?: () => Promise<Decoder>;
};

const native = async () => createImageBitmap;
const svg = async () => decodeSvg;
const heic = async () => decodeHeic;

const formats: Format[] = [
	{ types: ["image/tiff", "image/x-tiff"], extensions: ["tif", "tiff"] },
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

/** One decoder per image loader; GPU import pipelines are lazy and reused across documents. */
export function createDecoder(gpu: Gpu) {
	let loader: Promise<(file: Blob) => Promise<{ image: Target }>> | undefined;
	return async (file: File): Promise<{ image: Target }> => {
		const format = formatOf(file);
		if (!format) {
			throw Error(`Unsupported image: ${file.name}`);
		}
		if (!format.load) {
			loader ??= import("@/lib/formats/tiff").then((module) =>
				module.createLoader(gpu),
			);
			return (await loader)(file);
		}
		const decode = await format.load();
		return { image: linearize(gpu, await decode(file)) };
	};
}
