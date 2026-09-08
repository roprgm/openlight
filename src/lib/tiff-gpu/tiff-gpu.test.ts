import { afterAll, expect, test } from "bun:test";
import { Readable, Writable } from "node:stream";
import { createDeflate, createInflate } from "node:zlib";
import { init } from "vgpu/node";
import { decodeLzw, decodePackBits, inflate } from "./codecs";
import { readProfile } from "./color";
import {
	developDng,
	parseTiff,
	prepareDng,
	prepareTiff,
	readDng,
	readTiff,
} from "./index";
import { benchmark, decodeAt } from "./testing";

const fixture = (name: string) =>
	Bun.file(`${import.meta.dir}/fixtures/${name}`).arrayBuffer();

// Bun lacks the compression stream globals the CPU codecs use; zlib streams stand in.
const webStream = (create: () => import("node:stream").Duplex) =>
	class {
		readable = Readable.toWeb(create()) as unknown as ReadableStream;
		writable: WritableStream;
		constructor() {
			const stream = create();
			this.readable = Readable.toWeb(stream) as unknown as ReadableStream;
			this.writable = Writable.toWeb(stream);
		}
	};
Object.assign(globalThis, {
	CompressionStream: webStream(createDeflate),
	DecompressionStream: webStream(createInflate),
});
const strip = (
	buffer: ArrayBuffer,
	chunk: { offset: number; length: number },
) => new Uint8Array(buffer, chunk.offset, chunk.length);

test("directories describe strips, tiles, planes, BigTIFF, palettes, and profiles", async () => {
	const plain = parseTiff(await fixture("rgb16-le.tif"));
	const tiff = readTiff(await fixture("rgb16-prophoto.tif"));
	expect(tiff.directories).toHaveLength(1);
	expect(tiff.value(tiff.directories[0], 256)).toEqual([19]);
	expect(tiff.value(tiff.directories[0], 305)).toMatch(/^tifffile/);
	expect(tiff.bytes(tiff.directories[0], 34675)?.length).toBeGreaterThan(128);
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

test("prepare decompresses on the CPU and carries the file's color", async () => {
	const file = await fixture("lzw-strips.tif");
	const strips = await prepareTiff(file);
	expect(strips.chunks).toHaveLength(130 * 6);
	expect(strips.curves).toHaveLength(3 * 1024);
	expect(strips.matrix.map((v) => Math.round(v * 100) / 100)).toEqual([
		0.63, 0.07, 0.02, 0.33, 0.92, 0.09, 0.04, 0.01, 0.9,
	]);
	expect([...new Uint16Array(strips.data.buffer, strips.chunks[0], 3)]).toEqual(
		[123, 45, 67],
	);
	const plain = await fixture("rgb16-le.tif");
	expect((await prepareTiff(plain)).data.byteLength).toBe(plain.byteLength);
	const planar = await prepareTiff(await fixture("rgb16-planar-tiled.tif"));
	expect([planar.chunks.length, planar.data.byteLength]).toEqual([
		72,
		12 * 16 * 16 * 2 + 3,
	]);
	const half = await prepareTiff(await fixture("half-predictor.tif"));
	expect([half.info.predictor, ...half.data.subarray(0, 2)]).toEqual([
		1, 0x00, 0xb0,
	]);
	expect(half.curves[512]).toBeCloseTo(512 / 1023, 6);
	const srgb = await prepareTiff(await fixture("rgb16-le.tif"), {
		colorSpace: "srgb",
	});
	expect(srgb.matrix.map((v) => Math.round(v * 100) / 100 + 0)).toEqual([
		1, 0, 0, 0, 1, 0, 0, 0, 1,
	]);
	await expect(prepareTiff(await fixture("rgb8-jpeg.tif"))).rejects.toThrow(
		"Unsupported TIFF",
	);
});

test("profiles yield colorants and curves; anything else falls back to sRGB", async () => {
	const prophoto = readProfile(
		parseTiff(await fixture("rgb16-prophoto.tif")).icc ?? new Uint8Array(),
	);
	expect(
		[...(prophoto?.colorants ?? [])].map((v) => Math.round(v * 1e4) / 1e4),
	).toEqual([0.7977, 0.288, 0, 0.1352, 0.7119, 0, 0.0313, 0.0001, 0.8249]);
	expect(prophoto?.curves[1](0.5)).toBeCloseTo(0.5 ** (461 / 256), 6);
	const table = readProfile(
		parseTiff(await fixture("rgb8-srgb-table.tif")).icc ?? new Uint8Array(),
	);
	expect(table?.curves[2](128 / 255)).toBeCloseTo(0.2158605, 4);
	const gray = readProfile(
		parseTiff(await fixture("gray16-para.tif")).icc ?? new Uint8Array(),
	);
	expect(gray?.curves[0](0.5)).toBeCloseTo(0.2140411, 5);
	expect(readProfile(new Uint8Array(200))).toBeUndefined();
	expect(
		readProfile(new Uint8Array(await fixture("rgb16-le.tif"))),
	).toBeUndefined();
	const untagged = await prepareTiff(await fixture("gray16-para.tif"));
	expect(
		untagged.matrix.slice(0, 3).map((v) => Math.round(v * 100) / 100),
	).toEqual([1, 1, 1]);
});

// Shader tests run for real through vgpu's Node entry; `bun run test:gpu` opts in, so CI stays fast.
const gpu = process.env.GPU
	? await init().catch((error) => {
			console.warn(`Skipping GPU tests: ${error}`);
			return undefined;
		})
	: undefined;
afterAll(() => gpu?.dispose());

type Reference = {
	name: string;
	size: number[];
	tolerance: number;
	points: { x: number; y: number; rgba: number[] }[];
};
const banded = [
	"rgb16-le.tif",
	"lzw-strips.tif",
	"lzw-tiles.tif",
	"rgb16-planar-tiled.tif",
	"palette8.tif",
	"half-predictor.tif",
	"orientation-6.tif",
];

test.skipIf(!gpu)(
	"every fixture decodes to its linear Rec.2020 reference, in row bands alike",
	async () => {
		if (!gpu) return;
		const references: Reference[] = JSON.parse(
			await Bun.file(`${import.meta.dir}/fixtures/reference.json`).text(),
		);
		const decoded = new Map<string, number[][]>();
		for (const reference of references) {
			const result = await decodeAt(
				gpu,
				await fixture(reference.name),
				reference.points,
			);
			expect(result.size, reference.name).toEqual(reference.size);
			reference.points.forEach((point, i) => {
				point.rgba.forEach((value, channel) => {
					expect(
						Math.abs(result.values[i][channel] - value),
						`${reference.name} point ${i} channel ${channel}`,
					).toBeLessThan(reference.tolerance);
				});
			});
			decoded.set(reference.name, result.values);
		}
		const [first, second] = decoded.get("precision16.tif") ?? [];
		expect(second[0] - first[0]).toBeGreaterThan(0.0002);
		// Raw values in a float32 target: exact 16-bit samples over 65535, no curve or matrix.
		const raw = await decodeAt(
			gpu,
			await fixture("rgb16-le.tif"),
			[{ x: 18, y: 16 }],
			{ colorSpace: "none", format: "rgba32float" },
		);
		[54123, 56045, 57867, 65535].forEach((sample, channel) => {
			expect(raw.values[0][channel]).toBeCloseTo(sample / 65535, 6);
		});
		for (const name of banded) {
			// An 8 KB limit splits the wider fixtures into many bands; a transposed row alone pads to 256 bytes per column.
			const row = await benchmark(
				gpu,
				await fixture(name),
				{ reference: {}, banded: { limit: 8192 } },
				1,
			);
			expect(row, `${name} ${JSON.stringify(row)}`).toMatchObject({
				"banded mismatches": 0,
			});
		}
	},
);

test("DNG: the mosaic, its camera data, and lossless JPEG tiles", async () => {
	const raw = readDng(await fixture("bayer.dng"));
	expect(raw).toMatchObject({
		orientation: 1,
		crop: [0, 0, 64, 48],
		pattern: [0, 1, 1, 2],
		black: 512,
		white: 15000,
		neutral: [0.5, 1, 0.7],
	});
	expect(raw.matrix.map((v) => Math.round(v * 1000) / 1000)).toHaveLength(9);
	const tiled = readDng(await fixture("bayer-ljpeg.dng"));
	expect(tiled).toMatchObject({ orientation: 6, crop: [4, 2, 56, 44] });
	expect(tiled.image).toMatchObject({
		compression: 7,
		bitsPerSample: 16,
		chunkHeight: 16,
		across: 2,
	});
	const plain = await prepareDng(await fixture("bayer.dng"));
	const jpeg = await prepareDng(await fixture("bayer-ljpeg.dng"));
	const samples = (
		p: { prepared: { data: Uint8Array<ArrayBuffer>; chunks: Uint32Array } },
		chunk: number,
	) => [
		...new Uint16Array(p.prepared.data.buffer, p.prepared.chunks[chunk * 6], 4),
	];
	expect(samples(plain, 0)).toEqual([3000, 6000, 3000, 6000]);
	expect(samples(jpeg, 0)).toEqual([3000, 6000, 3000, 6000]);
	expect(samples(jpeg, 5)).toEqual([1000, 2000, 1000, 2000]);
});

test.skipIf(!gpu)(
	"DNG develops into the expected linear Rec.2020 colors",
	async () => {
		if (!gpu) return;
		const reference = JSON.parse(
			await Bun.file(`${import.meta.dir}/fixtures/dng.json`).text(),
		);
		for (const [name, size, at] of [
			[
				"bayer.dng",
				[64, 48],
				(bx: number, by: number) => [16 + bx * 32, 12 + by * 24],
			],
			// Orientation 6 rotates the cropped 56×44 mosaic clockwise; block (bx, by) lands at (43 - by * 22, bx * 28).
			[
				"bayer-ljpeg.dng",
				[44, 56],
				(bx: number, by: number) => [33 - by * 22, 14 + bx * 28],
			],
		] as const) {
			const image = developDng(gpu, await prepareDng(await fixture(name)));
			expect([...image.size], name).toEqual([...size]);
			const pixels = await image.readFloats();
			for (const [block, rgba] of Object.entries(reference.blocks) as [
				string,
				number[],
			][]) {
				const [bx, by] = block.split(",").map(Number);
				const [x, y] = at(bx, by);
				const got = [
					...pixels.subarray(
						(y * image.size[0] + x) * 4,
						(y * image.size[0] + x + 1) * 4,
					),
				];
				rgba.forEach((value, c) => {
					expect(
						Math.abs(got[c] - value),
						`${name} block ${block} channel ${c}`,
					).toBeLessThan(0.002);
				});
			}
			image.color.dispose();
		}
	},
);
