import { afterAll, expect, test } from "bun:test";
import { init } from "vgpu/node";
import { readTiff } from "@/lib/tiff-gpu/ifd";
import { decodeLosslessJpeg } from "@/lib/tiff-gpu/ljpeg";
import { readGainMap } from "./gain-map";
import { developDng, prepareDng, readDng } from "./index";

const fixture = (name: string) =>
	Bun.file(`${import.meta.dir}/fixtures/${name}`).arrayBuffer();

// Shader tests run for real through vgpu's Node entry; `bun run test:gpu` opts in, so CI stays fast.
const gpu = process.env.GPU
	? await init().catch((error) => {
			console.warn(`Skipping GPU tests: ${error}`);
			return undefined;
		})
	: undefined;
afterAll(() => gpu?.dispose());

test("DNG: the mosaic, its camera data, and lossless JPEG tiles", async () => {
	const raw = readDng(await fixture("bayer.dng"));
	expect(raw).toMatchObject({
		orientation: 1,
		crop: [0, 0, 64, 48],
		pattern: [0, 1, 1, 2],
		kind: "bayer",
		exposure: 0,
		black: [512],
		white: [15000],
		neutral: [0.5, 1, 0.7],
	});
	expect(raw.matrix.map((v) => Math.round(v * 1000) / 1000)).toHaveLength(9);
	const tiled = readDng(await fixture("bayer-ljpeg.dng"));
	expect(tiled).toMatchObject({ orientation: 6, crop: [4, 2, 56, 44] });
	expect(tiled.image).toMatchObject({
		compression: 7,
		chunkHeight: 16,
		across: 2,
	});
	const plain = await prepareDng(await fixture("bayer.dng"));
	const jpeg = await prepareDng(await fixture("bayer-ljpeg.dng"));
	expect(jpeg.prepared.info).toMatchObject({
		bitsPerSample: 16,
		littleEndian: true,
	});
	const samples = (
		p: { prepared: { data: Uint8Array<ArrayBuffer>; chunks: Uint32Array } },
		chunk: number,
	) => [
		...new Uint16Array(p.prepared.data.buffer, p.prepared.chunks[chunk * 6], 4),
	];
	expect(samples(plain, 0)).toEqual([3000, 6000, 3000, 6000]);
	expect(samples(jpeg, 0)).toEqual([3000, 6000, 3000, 6000]);
	expect(samples(jpeg, 5)).toEqual([1000, 2000, 1000, 2000]);
	const rgbBytes = await fixture("linear-ljpeg.dng");
	const chunk = readDng(rgbBytes).image.chunks[0];
	const encoded = new Uint8Array(
		rgbBytes.slice(chunk.offset, chunk.offset + chunk.length),
	);
	const output = new Uint8Array(16 * 12 * 3 * 2);
	for (const length of [0, 3, encoded.length - 16]) {
		expect(() =>
			decodeLosslessJpeg(encoded.subarray(0, length), output),
		).toThrow("lossless JPEG");
	}
	// Increase precision and point transform together: the entropy data stays unchanged, codes double.
	for (let at = 2; at < encoded.length; ) {
		const marker = encoded[at + 1];
		if (marker === 0xc3) encoded[at + 4]++;
		if (marker === 0xda) {
			encoded[at + 7 + encoded[at + 4] * 2] = 1;
			break;
		}
		at += 2 + ((encoded[at + 2] << 8) | encoded[at + 3]);
	}
	decodeLosslessJpeg(encoded, output);
	expect([...new Uint16Array(output.buffer).slice(0, 6)]).toEqual([
		1800, 3600, 4600, 3400, 4200, 2400,
	]);
});

test("DNG profile baseline and gain tables survive parsing and develop in active-area coordinates", async () => {
	const bytes = await fixture("profile.dng");
	const prepared = await prepareDng(bytes);
	if (!prepared.raw.gainMap) throw Error("Missing parsed gain map");
	expect(prepared.raw.exposure).toBe(1);
	expect(prepared.raw.gainMap).toMatchObject({
		points: [2, 2, 4],
		spacing: [0.5, 0.5],
		origin: [0.25, 0.25],
	});
	const tiff = readTiff(bytes);
	const map = tiff.bytes(tiff.directories[0].subdirectories[0], 52525);
	if (!map) throw Error("Missing gain map fixture");
	// Re-encode the packed fields in the other TIFF byte order.
	const big = new DataView(new ArrayBuffer(map.length));
	const little = new DataView(map.buffer, map.byteOffset, map.length);
	for (const at of [0, 4, 40]) big.setUint32(at, little.getUint32(at, true));
	for (const at of [8, 16, 24, 32])
		big.setFloat64(at, little.getFloat64(at, true));
	for (let at = 44; at < map.length; at += 4)
		big.setFloat32(at, little.getFloat32(at, true));
	expect(readGainMap(new Uint8Array(big.buffer), false)).toEqual(
		prepared.raw.gainMap,
	);
	expect(() => readGainMap(map.subarray(0, 60), true)).toThrow("Invalid DNG");
	expect(() => readGainMap(map.subarray(0, -4), true)).toThrow("Invalid DNG");
	big.setFloat32(64, Number.NaN);
	expect(() => readGainMap(new Uint8Array(big.buffer), false)).toThrow(
		"Invalid DNG",
	);
	if (!gpu) return;
	const reference = await Bun.file(
		`${import.meta.dir}/fixtures/profile.json`,
	).json();
	const image = developDng(gpu, prepared);
	try {
		expect(image.size).toEqual(reference.size);
		const pixels = await image.readFloats();
		// Independent expected pixels cover all 3 interpolation axes, rotated crop, and HDR headroom.
		reference.pixels.forEach((value: number, i: number) => {
			expect(Math.abs(pixels[i] - value), `profile sample ${i}`).toBeLessThan(
				0.003,
			);
		});
		expect(Math.max(...pixels)).toBeGreaterThan(2);
	} finally {
		image.color.dispose();
	}
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

test("LinearRaw selects the full RGB SubIFD, retains its channels and companding metadata", async () => {
	for (const name of ["linear.dng", "linear-ljpeg.dng", "linear-jxl.dng"]) {
		const { raw, prepared } = await prepareDng(await fixture(name));
		expect(raw).toMatchObject({
			kind: "linear",
			crop: [2, 2, 12, 8],
			orientation: 6,
			black: [64, 128, 256],
			white: [16383, 16383, 16383],
			blackRepeat: [1, 1],
		});
		expect(raw.image.samplesPerPixel).toBe(3);
		expect(raw.linearization).toHaveLength(4096);
		const pixels = new Uint16Array(prepared.data.buffer, prepared.chunks[0], 6);
		expect([...pixels]).toEqual([900, 1800, 2300, 1700, 2100, 1200]);
	}
});

test.skipIf(!gpu)(
	"linear DNG stages linearize before black subtraction and never demosaic",
	async () => {
		if (!gpu) return;
		const { frame } = await import("vgpu");
		const { createDevelopment } = await import("./develop");
		const reference = JSON.parse(
			await Bun.file(`${import.meta.dir}/fixtures/linear.json`).text(),
		);
		for (const name of ["linear.dng", "linear-ljpeg.dng", "linear-jxl.dng"]) {
			const pipeline = createDevelopment(
				gpu,
				await prepareDng(await fixture(name)),
			);
			try {
				expect(pipeline.stages.map((stage) => stage.id)).toEqual([
					"normalize",
					"working-color",
				]);
				frame(gpu, (f) => {
					pipeline.render(f, undefined);
				});
				const normalized = await pipeline.output("normalize").readFloats();
				reference.pixels.forEach(
					(pixel: { normalized: number[] }, x: number) => {
						pixel.normalized.forEach((v, c) => {
							expect(Math.abs(normalized[x * 4 + c] - v)).toBeLessThan(0.00001);
						});
					},
				);
				const image = pipeline.output("working-color");
				expect(image.size).toEqual(reference.size);
				const pixels = await image.readFloats();
				for (let y = 0; y < 12; y++)
					for (let x = 0; x < 8; x++) {
						// Inverse orientation 6: stored (2+y, 9-x), preserving the checkerboard exactly.
						const expected = reference.pixels[(11 + y - x) % 2].rgb;
						expected.forEach((v: number, c: number) => {
							expect(Math.abs(pixels[(y * 8 + x) * 4 + c] - v)).toBeLessThan(
								0.002,
							);
						});
					}
				const source = pipeline.output("source");
				const kept = pipeline.takeOutput();
				pipeline.dispose();
				expect(() => source.color.view).toThrow("destroyed");
				expect(() => kept.color.view).not.toThrow();
				kept.color.dispose();
			} finally {
				pipeline.dispose();
			}
		}
	},
);
