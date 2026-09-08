import { expect, test } from "bun:test";
import { decodeLzw, decodePackBits, inflate } from "./codecs";
import { parseTiff, prepareTiff } from "./index";

const fixture = (name: string) =>
	Bun.file(`${import.meta.dir}/fixtures/${name}`).arrayBuffer();
const strip = (
	buffer: ArrayBuffer,
	chunk: { offset: number; length: number },
) => new Uint8Array(buffer, chunk.offset, chunk.length);

test("directories describe strips, tiles, planes, BigTIFF, palettes, and profiles", async () => {
	const plain = parseTiff(await fixture("rgb16-le.tif"));
	expect(plain).toMatchObject({
		width: 19,
		height: 17,
		samplesPerPixel: 3,
		bitsPerSample: 16,
		compression: 1,
		planar: 1,
		littleEndian: true,
		across: 1,
		chunkHeight: 5,
	});
	expect(plain.chunks.map((chunk) => chunk.height)).toEqual([5, 5, 5, 2]);
	const tiled = parseTiff(await fixture("rgb16-planar-tiled.tif"));
	expect(tiled).toMatchObject({
		planar: 2,
		compression: 32946,
		predictor: 2,
		across: 2,
		chunkHeight: 16,
	});
	expect(tiled.chunks).toHaveLength(12);
	expect(parseTiff(await fixture("rgb16-bigtiff.tif"))).toMatchObject({
		width: 19,
		height: 17,
	});
	expect(parseTiff(await fixture("rgb16-lzw-be.tif")).littleEndian).toBe(false);
	expect(
		parseTiff(await fixture("rgb16-prophoto.tif")).icc?.length,
	).toBeGreaterThan(128);
	expect(parseTiff(await fixture("palette8.tif")).colorMap).toHaveLength(768);
	expect(parseTiff(await fixture("bilevel.tif"))).toMatchObject({
		bitsPerSample: 1,
		photometric: 0,
	});
	expect(parseTiff(await fixture("alpha16.tif"))).toMatchObject({
		samplesPerPixel: 4,
		premultiplied: true,
	});
	expect(() =>
		parseTiff(new TextEncoder().encode("not a tiff").buffer),
	).toThrow("Not a TIFF");
	const truncated = new Uint8Array(await fixture("rgb16-le.tif")).slice(
		0,
		plain.chunks[3].offset + 10,
	);
	expect(() => parseTiff(truncated.buffer)).toThrow();
});

test("CPU codecs reproduce uncompressed strips", async () => {
	const plainBuffer = await fixture("rgb16-le.tif");
	const lzwBuffer = await fixture("rgb16-lzw-be.tif");
	const plain = parseTiff(plainBuffer);
	const output = new Uint8Array(plain.chunks[0].length);
	decodeLzw(strip(lzwBuffer, parseTiff(lzwBuffer).chunks[0]), output);
	expect(Uint8Array.from(output, (_, i) => output[i ^ 1])).toEqual(
		strip(plainBuffer, plain.chunks[0]),
	);
	const packedBuffer = await fixture("rgb8-packbits.tif");
	const rows = new Uint8Array(19 * 5 * 3);
	decodePackBits(strip(packedBuffer, parseTiff(packedBuffer).chunks[0]), rows);
	expect([...rows.subarray(0, 6)]).toEqual([0, 0, 0, 12, 0, 6]);
	const source = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 7) % 251);
	const stream = new Blob([source])
		.stream()
		.pipeThrough(new CompressionStream("deflate"));
	const zipped = new Uint8Array(await new Response(stream).arrayBuffer());
	const restored = new Uint8Array(source.length);
	await inflate(zipped, restored);
	expect(restored).toEqual(source);
});

test("prepare decodes on the CPU or hands parallel chunks to the GPU", async () => {
	const file = await fixture("lzw-strips.tif");
	const parallel = await prepareTiff(file);
	expect(parallel.encoded).toBe("lzw");
	expect(parallel.data.byteLength).toBe(file.byteLength);
	expect(parallel.chunks).toHaveLength(130 * 6);
	const serial = await prepareTiff(file, { gpuChunks: 1000 });
	expect(serial.encoded).toBe(false);
	expect([...new Uint16Array(serial.data.buffer, serial.chunks[0], 3)]).toEqual(
		[123, 45, 67],
	);
	const planar = await prepareTiff(await fixture("rgb16-planar-tiled.tif"));
	expect([
		planar.encoded,
		planar.chunks.length,
		planar.data.byteLength,
	]).toEqual([false, 72, 12 * 16 * 16 * 2 + 3]);
	const half = await prepareTiff(await fixture("half-predictor.tif"));
	expect([half.info.predictor, ...half.data.subarray(0, 2)]).toEqual([
		1, 0x00, 0xb0,
	]);
	await expect(prepareTiff(await fixture("rgb8-jpeg.tif"))).rejects.toThrow(
		"Unsupported TIFF",
	);
});
