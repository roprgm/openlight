import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

test("TIFF imports preserve color, alpha and 16-bit precision", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const cases = [
		{
			name: "rgb8.tif",
			size: [3, 2],
			pixels: [
				[0.627404, 0.069097, 0.016391, 1],
				[0.329283, 0.91954, 0.088013, 1],
				[0.043313, 0.011362, 0.895595, 1],
				[0, 0, 0, 1],
				[0.21586, 0.21586, 0.21586, 1],
				[1, 1, 1, 1],
			],
		},
		{
			name: "rgb16-le.tif",
			size: [4, 2],
			pixels: [
				[1, 0, 0, 1],
				[0, 1, 0, 1],
				[0, 0, 1, 1],
				[0.25, 0.25, 0.25, 1],
				[0.25049, 0.25049, 0.25049, 1],
				[0, 0, 0, 1],
				[0.5, 0.25, 0.125, 0.5],
				[1, 1, 1, 1],
			],
		},
	];
	for (const fixture of cases) {
		await test.step(fixture.name, async () => {
			const bytes = [
				...(await readFile(`tests/fixtures/tiff/${fixture.name}`)),
			];
			const result = await page.evaluate(
				async ({ bytes, name }) => {
					await window.openlight.loadImage(
						new File([new Uint8Array(bytes)], name),
					);
					return {
						size: window.openlight.getState().size,
						pixels: [...(await window.openlight.readSourcePixels())],
					};
				},
				{ bytes, name: fixture.name },
			);
			expect(result.size).toEqual(fixture.size);
			for (const [i, expected] of fixture.pixels.flat().entries()) {
				expect(Math.abs(result.pixels[i] - expected)).toBeLessThan(0.001);
			}
			if (fixture.name === "rgb16-le.tif") {
				expect(result.pixels[16] - result.pixels[12]).toBeGreaterThan(0.0002);
			}
		});
	}
});
