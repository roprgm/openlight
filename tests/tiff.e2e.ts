import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

const directory = "tests/fixtures/tiff";
test("TIFF preserve samples, color, orientation, alpha and HDR", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const cases: {
		name: string;
		size: number[];
		tolerance: number;
		points: { x: number; y: number; rgba: number[] }[];
	}[] = JSON.parse(await readFile(`${directory}/reference.json`, "utf8"));
	for (const fixture of cases) {
		await test.step(fixture.name, async () => {
			const bytes = [...(await readFile(`${directory}/${fixture.name}`))];
			const result = await page.evaluate(
				async ({ bytes, fixture }) => {
					await window.openlight.loadImage(
						new File([new Uint8Array(bytes)], fixture.name),
					);
					const pixels = await window.openlight.readSourcePixels(),
						size = window.openlight.getState().size;
					if (!size) {
						throw new Error("Image did not open.");
					}
					return {
						size,
						points: fixture.points.map(({ x, y }) => [
							...pixels.slice((y * size[0] + x) * 4, (y * size[0] + x) * 4 + 4),
						]),
					};
				},
				{ bytes, fixture },
			);
			expect(result.size).toEqual(fixture.size);
			if (fixture.name.startsWith("precision")) {
				const difference = result.points[1][0] - result.points[0][0];
				expect(difference).toBeGreaterThan(0.0002);
				expect(difference).toBeLessThan(0.001);
			}
			for (let p = 0; p < fixture.points.length; p++) {
				for (let c = 0; c < 4; c++) {
					expect(
						Math.abs(result.points[p][c] - fixture.points[p].rgba[c]),
					).toBeLessThan(fixture.tolerance);
				}
			}
		});
	}
	await test.step("reject invalid floats and recover", async () => {
		for (const name of ["nonfinite.tif", "overflow.tif"]) {
			const bytes = [...(await readFile(`${directory}/${name}`))];
			await page.evaluate(
				({ bytes, name }) =>
					window.openlight.loadImage(new File([new Uint8Array(bytes)], name)),
				{ bytes, name },
			);
			await expect(
				page.getByText(`Couldn't open ${name}:`, { exact: false }),
			).toBeVisible();
		}
	});
	await test.step("lower exposure recovers HDR highlights and undo preserves the source", async () => {
		const result = await page.evaluate(
			async (bytes) => {
				const api = window.openlight;
				await api.loadImage(new File([new Uint8Array(bytes)], "hdr.tif"));
				api.setAdjustments({ exposure: -2 });
				const image = await createImageBitmap(await api.exportImage());
				const canvas = new OffscreenCanvas(image.width, image.height),
					context = canvas.getContext("2d");
				if (!context) {
					throw new Error("Cannot read HDR export.");
				}
				context.drawImage(image, 0, 0);
				image.close();
				const pixels = [...context.getImageData(0, 1, 7, 1).data];
				api.undo();
				return {
					pixels,
					exposure: api.getState().adjustments.exposure,
					source: [...(await api.readSourcePixels())],
				};
			},
			[...(await readFile(`${directory}/hdr-le.tif`))],
		);
		expect(result.exposure).toBe(0);
		expect(result.pixels[20]).toBeGreaterThan(170);
		expect(result.pixels[20]).toBeLessThan(195);
		expect(result.pixels[24]).toBeGreaterThan(240);
		expect(result.source[24]).toBeGreaterThan(3.99);
	});
});
