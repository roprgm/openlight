import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

test("loads a HEIC image with the expected dimensions and pixels", async ({
	page,
}) => {
	const bytes = await readFile(
		new URL("./fixtures/patches.heic", import.meta.url),
	);
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const result = await page.evaluate(
		async (bytes) => {
			await window.openlight.loadImage(
				new File([new Uint8Array(bytes)], "patches.heic", {
					type: "image/heic",
				}),
			);
			const image = await createImageBitmap(
				await window.openlight.exportImage(),
			);
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Cannot read exported image.");
			context.drawImage(image, 0, 0);
			image.close();
			return {
				size: [canvas.width, canvas.height],
				pixels: [
					[16, 16],
					[48, 16],
					[16, 48],
					[48, 48],
				].flatMap(([x, y]) => [...context.getImageData(x, y, 1, 1).data]),
			};
		},
		[...bytes],
	);

	expect(result.size).toEqual([64, 64]);
	// Reference pixels decoded independently with libheif.
	const expected = [
		176, 96, 95, 255, 97, 176, 97, 255, 94, 95, 175, 255, 128, 128, 128, 255,
	];
	result.pixels.forEach((value, i) => {
		expect(Math.abs(value - expected[i]), `Channel ${i}`).toBeLessThanOrEqual(
			3,
		);
	});
});
