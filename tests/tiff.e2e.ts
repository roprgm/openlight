import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

const directory = "src/lib/tiff-gpu/fixtures";

test("TIFF files open through the loader with their color, orientation, and headroom", async ({
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
	// Row 1 of the float file holds linear 1, 2, and 4 at x = 4..6: all clip at first, then separate at -2 stops.
	await load("float32-be.tif");
	const row = () =>
		page.evaluate(async () => {
			const image = await createImageBitmap(
				await window.openlight.exportImage(),
			);
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Cannot read exported image.");
			context.drawImage(image, 0, 0);
			image.close();
			return [...context.getImageData(0, 1, 7, 1).data].filter(
				(_, i) => i % 4 === 0,
			);
		});
	expect((await row()).slice(4)).toEqual([255, 255, 255]);
	await page.evaluate(() => window.openlight.setAdjustments({ exposure: -2 }));
	const recovered = await row();
	expect(recovered[4]).toBeLessThan(150);
	expect(recovered[5]).toBeGreaterThan(recovered[4]);
	expect(recovered[6]).toBeGreaterThan(240);
	await load("rgb8-jpeg.tif");
	await expect(
		page.getByText("Couldn't open rgb8-jpeg.tif:", { exact: false }),
	).toBeVisible();
});
