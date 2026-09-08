import { prepareTiff } from "@/lib/tiff-gpu/prepare";

self.onmessage = async ({ data }: MessageEvent<Blob>) => {
	try {
		const prepared = await prepareTiff(await data.arrayBuffer());
		self.postMessage(prepared, {
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
