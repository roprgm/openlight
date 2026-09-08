import { prepareDng } from "@/lib/tiff-gpu/dng";

self.onmessage = async ({ data }: MessageEvent<Blob>) => {
	try {
		const result = await prepareDng(await data.arrayBuffer());
		const { prepared } = result;
		self.postMessage(result, {
			transfer: [
				prepared.data.buffer,
				prepared.chunks.buffer,
				prepared.curves.buffer,
			],
		});
	} catch (error) {
		self.postMessage({ error: String(error) });
	}
};
