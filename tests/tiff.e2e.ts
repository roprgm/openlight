import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

type Reference = {
	name: string;
	size: number[];
	tolerance: number;
	points: { x: number; y: number; rgba: number[] }[];
};
const directory = "src/lib/tiff-gpu/fixtures";

test("TIFF samples keep precision, color, orientation, alpha, and HDR headroom", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const references: Reference[] = JSON.parse(
		await readFile(`${directory}/reference.json`, "utf8"),
	);
	const results = new Map<string, number[][]>();
	for (const reference of references) {
		await test.step(reference.name, async () => {
			const result = await page.evaluate(
				async ({ bytes, name, points }) => {
					const api = window.openlight;
					await api.loadImage(new File([new Uint8Array(bytes)], name));
					const size = api.getState().size;
					if (!size) throw new Error(`Could not open ${name}.`);
					const pixels = await api.readSourcePixels();
					const pixel = ({ x, y }: { x: number; y: number }) => [
						...pixels.subarray(
							(y * size[0] + x) * 4,
							(y * size[0] + x + 1) * 4,
						),
					];
					return { size, pixels: points.map(pixel) };
				},
				{
					bytes: [...(await readFile(`${directory}/${reference.name}`))],
					name: reference.name,
					points: reference.points,
				},
			);
			expect(result.size).toEqual(reference.size);
			reference.points.forEach((point, i) => {
				point.rgba.forEach((value, c) => {
					expect(
						Math.abs(result.pixels[i][c] - value),
						`${reference.name} point ${i} channel ${c}`,
					).toBeLessThan(reference.tolerance);
				});
			});
			results.set(reference.name, result.pixels);
		});
	}
	await test.step("unsupported compression reports an error", async () => {
		const bytes = [...(await readFile(`${directory}/rgb8-jpeg.tif`))];
		await page.evaluate(
			(bytes) =>
				window.openlight.loadImage(
					new File([new Uint8Array(bytes)], "rgb8-jpeg.tif"),
				),
			bytes,
		);
		await expect(
			page.getByText("Couldn't open rgb8-jpeg.tif:", { exact: false }),
		).toBeVisible();
	});
	await test.step("adjacent 16-bit values stay distinct", () => {
		const [first, second] = results.get("precision16.tif") ?? [];
		expect(second[0] - first[0]).toBeGreaterThan(0.0002);
	});
	await test.step("lowering exposure recovers highlights above 1.0", async () => {
		const bytes = [...(await readFile(`${directory}/float32-be.tif`))];
		const rows = await page.evaluate(async (bytes) => {
			const api = window.openlight;
			await api.loadImage(new File([new Uint8Array(bytes)], "float32-be.tif"));
			const read = async () => {
				const image = await createImageBitmap(await api.exportImage());
				const canvas = new OffscreenCanvas(image.width, image.height);
				const context = canvas.getContext("2d");
				if (!context) throw new Error("Cannot read exported image.");
				context.drawImage(image, 0, 0);
				image.close();
				return [...context.getImageData(0, 1, 7, 1).data].filter(
					(_, i) => i % 4 === 0,
				);
			};
			const before = await read();
			api.setAdjustments({ exposure: -2 });
			return { before, after: await read() };
		}, bytes);
		// Row 1 holds linear 1, 2, and 4 at x = 4..6: all clip at first, then separate by brightness.
		expect(rows.before.slice(4)).toEqual([255, 255, 255]);
		expect(rows.after[4]).toBeLessThan(150);
		expect(rows.after[5]).toBeGreaterThan(rows.after[4]);
		expect(rows.after[6]).toBeGreaterThan(240);
	});
});
