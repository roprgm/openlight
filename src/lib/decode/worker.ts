import type { PreparedDng } from "@/lib/camera-raw/dng";
import type { Prepared } from "@/lib/tiff-gpu/prepare";
import type { Decoder } from "./types";

export type PreparedImages = { tiff: Prepared; dng: PreparedDng };
export type DecodeRequest = { file: Blob; format: keyof PreparedImages };

/** One worker per file. Success, decoding errors, and worker failures all release it. */
export function workerDecoder<Format extends keyof PreparedImages>(
	format: Format,
): Decoder<PreparedImages[Format]> {
	return async (file) => {
		const { default: Spawn } = await import("./image.worker?worker");
		const worker = new Spawn();
		try {
			return await new Promise<PreparedImages[Format]>((resolve, reject) => {
				worker.onmessage = ({
					data,
				}: MessageEvent<PreparedImages[Format] | { error: string }>) => {
					if ("error" in data) reject(new Error(data.error));
					else resolve(data);
				};
				worker.onerror = (event) => {
					event.preventDefault();
					reject(new Error(event.message || "Image decoding worker failed."));
				};
				worker.onmessageerror = () =>
					reject(new Error("Could not read the decoded image."));
				worker.postMessage({ file, format } satisfies DecodeRequest);
			});
		} finally {
			worker.terminate();
		}
	};
}
