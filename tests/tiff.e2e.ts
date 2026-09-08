import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

const directory = "src/lib/tiff-gpu/fixtures";

test("TIFF files open through the loader with their color and orientation", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const load = async (name: string) => {
		const bytes = [...(await readFile(`${directory}/${name}`))];
		await page.evaluate(
			({ bytes, name }) =>
				window.openlight.loadImage(new File([new Uint8Array(bytes)], name)),
			{ bytes, name },
		);
	};
	// A gray profile file exported back to sRGB returns its encoded value: 16384 of 65535 is 64 of 255.
	await load("gray16-para.tif");
	const gray = await readImage(page);
	expect(gray.size).toEqual([7, 5]);
	for (const value of gray.center.slice(0, 3)) {
		expect(Math.abs(value - 64)).toBeLessThanOrEqual(1);
	}
	await load("orientation-6.tif");
	expect((await readImage(page)).size).toEqual([17, 19]);
	await load("rgb8-jpeg.tif");
	await expect(
		page.getByText("Couldn't open rgb8-jpeg.tif:", { exact: false }),
	).toBeVisible();
});
