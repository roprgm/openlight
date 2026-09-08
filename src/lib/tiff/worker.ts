import { decodeTiff } from "./tiff";

self.onmessage = async ({ data }: MessageEvent<Blob>) => {
	try {
		if (data.size > 512_000_000) {
			throw new Error("Image exceeds the 512 MB import limit.");
		}
		const image = await decodeTiff(new Uint8Array(await data.arrayBuffer()));
		self.postMessage(image, {
			transfer: [
				...new Set([
					...image.chunks.map((c) => c.data.buffer),
					image.curves.buffer,
				]),
			],
		});
	} catch (error) {
		self.postMessage({ error: String(error) });
	}
};
