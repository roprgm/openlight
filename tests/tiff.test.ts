import { expect, test } from "bun:test";
import { decompress } from "@/lib/tiff/compression";
import { decodeTiff, Tiff } from "@/lib/tiff/tiff";

const fixture = async (name: string) =>
	new Uint8Array(await Bun.file(`tests/fixtures/tiff/${name}`).arrayBuffer());

test("TIFF directory traversal, decompression and profiles are bounded and deterministic", async () => {
	const bytes = await fixture("rgb16-le.tif");
	const raster = await decodeTiff(bytes);
	expect([raster.width, raster.height, raster.bits, raster.channels]).toEqual([
		19, 17, 16, 3,
	]);
	expect(raster.chunks.map((c) => c.height)).toEqual([5, 5, 5, 2]);
	for (const length of [0, 7, 40, bytes.length - 10]) {
		await expect(decodeTiff(bytes.slice(0, length))).rejects.toThrow();
	}
	const profile = await fixture("rgb16-icc.tif"),
		profileStart = new Tiff(profile).directories[0].offsets.get(34675) ?? 0,
		profileView = new DataView(profile.buffer, profileStart);
	// Shorten the first TRC tag while leaving the surrounding profile data available.
	profileView.setUint32(132 + 4 * 12 + 8, 8);
	await expect(decodeTiff(profile)).rejects.toThrow("ICC");
	const cyclic = bytes.slice(),
		view = new DataView(cyclic.buffer),
		ifd = view.getUint32(4, true);
	view.setUint32(ifd + 2 + view.getUint16(ifd, true) * 12, ifd, true);
	expect(() => new Tiff(cyclic)).toThrow("directories");
	const big = bytes.slice();
	new DataView(big.buffer).setUint16(2, 43, true);
	expect(() => new Tiff(big)).toThrow("BigTIFF");
	await expect(decompress(new Uint8Array([127, 0]), 32773, 1)).rejects.toThrow(
		"PackBits",
	);
	await expect(decompress(new Uint8Array([0xff]), 5, 1)).rejects.toThrow("LZW");
	await expect(decompress(new Uint8Array([0]), 99, 1)).rejects.toThrow(
		"compression",
	);
	await expect(decompress(new Uint8Array([0]), 1, 2)).rejects.toThrow("length");
});
