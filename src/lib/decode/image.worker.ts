import { prepareDng } from "@/lib/camera-raw/dng";
import { prepareTiff } from "@/lib/tiff-gpu/prepare";
import type { DecodeRequest } from "./worker";

self.onmessage = async ({
	data: { file, format },
}: MessageEvent<DecodeRequest>) => {
	try {
		const bytes = await file.arrayBuffer();
		const result =
			format === "dng" ? await prepareDng(bytes) : await prepareTiff(bytes);
		const prepared = "prepared" in result ? result.prepared : result;
		const transfer: Transferable[] = [
			prepared.data.buffer,
			prepared.chunks.buffer,
			prepared.curves.buffer,
		];
		if ("raw" in result && result.raw.gainMap)
			transfer.push(result.raw.gainMap.values.buffer);
		self.postMessage(result, { transfer });
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : String(error),
		});
	}
};
