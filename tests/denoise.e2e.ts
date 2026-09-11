import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function loadFixture(page: Page, name: string) {
	const bytes = [...(await readFile(`tests/fixtures/${name}`))];
	await page.evaluate(
		({ bytes, name }) =>
			window.openlight.loadImage(new File([new Uint8Array(bytes)], name)),
		{ bytes, name },
	);
}

async function readPixels(page: Page) {
	return page.evaluate(async () => {
		const bitmap = await createImageBitmap(
			await window.openlight.exportImage(),
		);
		const { width, height } = bitmap;
		const context = new OffscreenCanvas(width, height).getContext("2d");
		if (!context) {
			throw Error("Cannot read exported image.");
		}
		context.drawImage(bitmap, 0, 0);
		bitmap.close();
		return {
			width,
			height,
			pixels: [...context.getImageData(0, 0, width, height).data],
		};
	});
}

type Image = Awaited<ReturnType<typeof readPixels>>;

/** RGB error against the clean image, plus per-channel bias to catch color shifts. */
function difference(
	image: Image,
	reference: Image,
	region = [0, 0, image.width, image.height],
) {
	const [left, top, width, height] = region;
	const bias = [0, 0, 0];
	let squaredError = 0;
	for (let y = top; y < top + height; y++) {
		for (let x = left; x < left + width; x++) {
			for (let c = 0; c < 3; c++) {
				const i = (y * image.width + x) * 4 + c;
				const error = image.pixels[i] - reference.pixels[i];
				squaredError += error * error;
				bias[c] += error;
			}
		}
	}
	return {
		mse: squaredError / (width * height * 3),
		bias: Math.max(...bias.map((v) => Math.abs(v) / (width * height))),
	};
}

for (const format of ["png", "tif", "dng"]) {
	test(`noise reduction cleans ${format} without distorting the image`, async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await page.goto("/");
		await page.waitForFunction(() => window.openlight);
		await loadFixture(page, `denoise-clean.${format}`);
		const clean = await readPixels(page);
		await loadFixture(page, `denoise-noisy.${format}`);
		const noisy = await readPixels(page);

		await page.evaluate(() => window.openlight.setNoiseReduction(100));
		const filtered = await readPixels(page);

		expect([filtered.width, filtered.height]).toEqual([
			clean.width,
			clean.height,
		]);
		expect(difference(noisy, clean).mse).toBeGreaterThan(5);
		expect(difference(filtered, clean).mse).toBeLessThan(
			difference(noisy, clean).mse * 0.65,
		);
		expect(difference(filtered, clean).bias).toBeLessThan(2);
		expect(filtered.pixels.filter((_, i) => i % 4 === 3)).toEqual(
			clean.pixels.filter((_, i) => i % 4 === 3),
		);
		if (format === "png") {
			// Fine stripes must survive; replacing them with a flat blur must fail.
			const stripes = [32, 34, 148, 13];
			expect(difference(filtered, clean, stripes).mse).toBeLessThan(
				difference(noisy, clean, stripes).mse * 0.7,
			);
			// The fixture crosses a processing-tile boundary at x=384.
			expect(difference(filtered, clean, [380, 8, 9, 20]).mse).toBeLessThan(15);
		}
		await page.evaluate(() => window.openlight.setNoiseReduction(0));
		expect(await readPixels(page)).toEqual(noisy);
	});
}
