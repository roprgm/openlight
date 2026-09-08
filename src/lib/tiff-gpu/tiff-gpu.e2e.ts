import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

type Reference = {
	name: string;
	points: { x: number; y: number; samples?: number[] }[];
};
const fixture = (name: string) =>
	readFile(new URL(`fixtures/${name}`, import.meta.url));
const banded = [
	"rgb16-le.tif",
	"lzw-strips.tif",
	"rgb16-planar-tiled.tif",
	"palette8.tif",
	"half-predictor.tif",
];

test("tiff-gpu decodes stored samples, in row bands and with GPU codecs", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	// The first page load may still be optimizing dependencies; imports during that reload fail.
	await page.waitForLoadState("networkidle");
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
			const path = "/src/lib/tiff-gpu/testing.ts";
			const { inflateOnGpu } = await import(/* @vite-ignore */ path);
			return inflateOnGpu(streams);
		}, streams);
		results.forEach((result, i) => {
			expect(result, `stream ${i}`).toEqual([...sources[Math.floor(i / 3)]]);
		});
	});
	await test.step("every fixture decodes to its stored samples", async () => {
		const references: Reference[] = JSON.parse(
			await readFile(
				new URL("fixtures/reference.json", import.meta.url),
				"utf8",
			),
		);
		for (const reference of references.filter((r) => r.points[0].samples)) {
			const samples = await page.evaluate(
				async ({ bytes, points }) => {
					const path = "/src/lib/tiff-gpu/testing.ts";
					const { samplesAt } = await import(/* @vite-ignore */ path);
					return samplesAt(
						URL.createObjectURL(new Blob([new Uint8Array(bytes)])),
						points,
					);
				},
				{
					bytes: [...(await fixture(reference.name))],
					points: reference.points,
				},
			);
			expect(samples, reference.name).toEqual(
				reference.points.map((point) => point.samples),
			);
		}
	});
	await test.step("row bands and GPU codecs decode identical pixels", async () => {
		const files = await Promise.all(
			banded.map(async (name) => ({ name, bytes: [...(await fixture(name))] })),
		);
		const rows = await page.evaluate(async (files) => {
			const path = "/src/lib/tiff-gpu/testing.ts";
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
			expect(row, `${banded[i]} ${JSON.stringify(row)}`).toMatchObject({
				"banded mismatches": 0,
				"gpu mismatches": 0,
			});
		}
	});
	expect(errors).toEqual([]);
});
