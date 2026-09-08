import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { expect, test } from "./fixtures";

const names = [
	"rgb16-le.tif",
	"lzw-strips.tif",
	"rgb16-planar-tiled.tif",
	"palette8.tif",
	"half-predictor.tif",
];

test("tiff-gpu decodes the same pixels in row bands and with GPU codecs", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await test.step("GPU inflate handles stored, fixed, and dynamic blocks", async () => {
		const sources = [50, 700, 5000, 70000].flatMap((size) => [
			Uint8Array.from({ length: size }, (_, i) => (i * 7919) % 256),
			Uint8Array.from({ length: size }, (_, i) =>
				"the quick brown fox ".charCodeAt(i % 20),
			),
		]);
		const streams = sources.flatMap((source) =>
			[0, 1, 9].map((level) => ({
				bytes: [...deflateSync(source, { level })],
				size: source.length,
			})),
		);
		const results: number[][] = await page.evaluate(async (streams) => {
			const path = "/src/lib/tiff-gpu/bench.ts";
			const { inflateOnGpu } = await import(/* @vite-ignore */ path);
			return inflateOnGpu(streams);
		}, streams);
		results.forEach((result, i) => {
			expect(result, `stream ${i}`).toEqual([...sources[Math.floor(i / 3)]]);
		});
	});
	const files = await Promise.all(
		names.map(async (name) => ({
			name,
			bytes: [...(await readFile(`tests/fixtures/tiff/${name}`))],
		})),
	);
	const rows = await page.evaluate(async (files) => {
		const path = "/src/lib/tiff-gpu/bench.ts";
		const { benchmark } = await import(/* @vite-ignore */ path);
		const urls = files.map(({ bytes }) =>
			URL.createObjectURL(new Blob([new Uint8Array(bytes)])),
		);
		// 4 KB bands split every fixture into many uploads; a zero threshold forces LZW and Deflate onto the GPU.
		return benchmark(
			urls,
			{
				reference: {},
				banded: { limit: 4096 },
				gpu: { limit: 4096, gpuChunks: 0 },
			},
			1,
		);
	}, files);
	for (const [i, row] of rows.entries()) {
		expect(row, `${names[i]} ${JSON.stringify(row)}`).toMatchObject({
			"banded mismatches": 0,
			"gpu mismatches": 0,
		});
		expect(row.reference, names[i]).not.toHaveProperty("error");
	}
});
