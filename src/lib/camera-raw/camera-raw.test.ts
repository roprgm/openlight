import { afterAll, expect, test } from "bun:test";
import { init } from "vgpu/node";
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
		black: 512,
		white: 15000,
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
