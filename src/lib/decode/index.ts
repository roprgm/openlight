import type { Gpu, Target } from "vgpu";
import decodeHeic from "./heic";
import linearize from "./linearize";
import decodeSvg from "./svg";
import type { Decoder, Pixels } from "./types";

export type { Target };

/**
 * Decoder backed by a worker module: post the file, receive transferred pixels or an error.
 * Unused since HEIC moved to WebCodecs; kept for CPU-heavy decoders to come (RAW).
 */
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
				}: MessageEvent<Pixels | { error: string }>) => {
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

const formats: Format[] = [
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

/** Decodes the file into a linear rgba16float target: the format's decoder, then its GPU leg. */
export default async function decode(gpu: Gpu, file: File): Promise<Target> {
	const format = formatOf(file);
	if (!format) {
		throw new Error(`Unsupported image: ${file.name}`);
	}
	const decoder = await format.load();
	return linearize(gpu, await decoder(file));
}
