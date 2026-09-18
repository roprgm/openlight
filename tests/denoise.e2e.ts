import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { noiseReductionEditing } from "./noise-reduction-editing";

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

test("chroma reconstruction stays continuous across noise bins and preserves luminance", async ({
	page,
}) => {
	await page.goto("/tests/gpu.html");
	const { before, after } = await page.evaluate(async () => {
		const path = "/tests/chroma-transfer.ts";
		const { renderChromaRamp } = (await import(
			path
		)) as typeof import("./chroma-transfer");
		return renderChromaRamp();
	});
	expect(before[0]).toBeGreaterThan(0.005);
	// A strong fine-scale outlier must still receive the broad color correction.
	const spike = (4 * 128 + 64) * 4;
	expect(Math.abs(after[spike] - before[spike])).toBeGreaterThan(0.0002);
	expect(after.every(Number.isFinite)).toBe(true);
	expect(after[(4 * 128 + 90) * 4]).toBeGreaterThan(1);
	expect(after[(4 * 128 + 100) * 4]).toBeLessThan(0);
	const translucent = (4 * 128 + 110) * 4;
	expect(after.slice(translucent, translucent + 4)).toEqual(
		before.slice(translucent, translucent + 4),
	);
	const corrections = Array.from(
		{ length: 128 },
		(_, x) => after[x * 4] - before[x * 4],
	);
	expect(Math.max(...corrections.map(Math.abs))).toBeGreaterThan(0.0005);
	for (let x = 1; x < corrections.length; x++) {
		expect(Math.abs(corrections[x] - corrections[x - 1])).toBeLessThan(1e-5);
	}
	for (let i = 0; i < before.length; i += 4) {
		const luminanceChange = [0.2627, 0.678, 0.0593].reduce(
			(sum, weight, c) => sum + weight * (after[i + c] - before[i + c]),
			0,
		);
		expect(Math.abs(luminanceChange)).toBeLessThan(
			2e-7 * Math.max(1, Math.abs(before[i])),
		);
		expect(after[i + 3]).toBe(before[i + 3]);
	}
});

test("noise estimation includes bottom shadows in small pyramid levels", async ({
	page,
}) => {
	await page.goto("/tests/gpu.html");
	const variance = await page.evaluate(async () => {
		const path = "/tests/chroma-transfer.ts";
		const { sampleShadowNoise } = (await import(
			path
		)) as typeof import("./chroma-transfer");
		return sampleShadowNoise();
	});
	expect(variance.some((bin) => bin[1] > 1e-5 && bin[2] > 1e-5)).toBe(true);
});

/** RGB error against the clean image, plus per-channel bias to catch color shifts. */
function difference(
	image: Image,
	reference: Image,
	region = [0, 0, image.width, image.height],
) {
	const [left, top, width, height] = region;
	const bias = [0, 0, 0];
	let squaredError = 0;
	let chromaError = 0;
	for (let y = top; y < top + height; y++) {
		for (let x = left; x < left + width; x++) {
			const i = (y * image.width + x) * 4;
			const red = image.pixels[i] - reference.pixels[i];
			const green = image.pixels[i + 1] - reference.pixels[i + 1];
			const blue = image.pixels[i + 2] - reference.pixels[i + 2];
			chromaError += (red - blue) ** 2 / 2 + (red - 2 * green + blue) ** 2 / 6;
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
		chromaMse: chromaError / (width * height * 2),
		bias: Math.max(...bias.map((v) => Math.abs(v) / (width * height))),
	};
}

test("Bayer chroma cleanup removes broad color noise at +2 EV while retaining texture", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await loadFixture(page, "denoise-clean.chroma.dng");
	await page.evaluate(() => window.openlight.setAdjustments({ exposure: 2 }));
	const clean = await readPixels(page);
	await page.evaluate(() => window.openlight.setNoiseReduction(100));
	expect(difference(await readPixels(page), clean).mse).toBeLessThan(0.2);
	await loadFixture(page, "denoise-noisy.chroma.dng");
	await page.evaluate(() => window.openlight.setAdjustments({ exposure: 2 }));
	const noisy = await readPixels(page);
	await page.evaluate(() => window.openlight.setNoiseReduction(100));
	const filtered = await readPixels(page);
	for (const region of [
		[0, 0, 320, 320],
		[16, 248, 192, 56],
	]) {
		expect(difference(filtered, clean, region).chromaMse).toBeLessThan(
			difference(noisy, clean, region).chromaMse * 0.85,
		);
	}
	const shadowRatios: number[] = [];
	for (let y = 248; y < 304; y += 8) {
		for (let x = 16; x < 208; x += 8) {
			const region = [x, y, 8, 8];
			const noise = difference(noisy, clean, region).chromaMse;
			if (noise > 100) {
				shadowRatios.push(
					difference(filtered, clean, region).chromaMse / noise,
				);
			}
		}
	}
	// Whole-image averages can hide small unfiltered islands in the shadows.
	shadowRatios.sort((a, b) => a - b);
	expect(shadowRatios.length).toBeGreaterThan(100);
	expect(shadowRatios[Math.ceil(shadowRatios.length * 0.9) - 1]).toBeLessThan(
		0.7,
	);
	expect(
		difference(filtered, clean, [16, 248, 192, 56]).chromaMse,
	).toBeLessThan(difference(noisy, clean, [16, 248, 192, 56]).chromaMse * 0.29);
	const flat = [16, 16, 128, 96];
	expect(difference(filtered, clean, flat).chromaMse).toBeLessThan(
		difference(noisy, clean, flat).chromaMse * 0.7,
	);
	// Fine luminance stripes, a color boundary and a small saturated light survive.
	expect(difference(filtered, clean, [16, 136, 192, 72]).mse).toBeLessThan(75);
	expect(difference(filtered, clean, [216, 16, 16, 96]).mse).toBeLessThan(105);
	expect(difference(filtered, clean, [157, 59, 4, 4]).mse).toBeLessThan(95);
	await page.evaluate(() => window.openlight.setNoiseReduction(50));
	expect(difference(await readPixels(page), filtered).mse).toBeGreaterThan(0.1);
	await page.evaluate(() => window.openlight.undo());
	expect(await readPixels(page)).toEqual(filtered);
	await page.evaluate(() => window.openlight.setNoiseReduction(0));
	expect(await readPixels(page)).toEqual(noisy);
});

test("Bayer filtering cleans noisier sky corners without removing lawn color", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await loadFixture(page, "denoise-clean.surfaces.dng");
	await page.evaluate(() => window.openlight.setAdjustments({ exposure: 2 }));
	const clean = await readPixels(page);
	await loadFixture(page, "denoise-noisy.surfaces.dng");
	await page.evaluate(() => {
		window.openlight.setAdjustments({ exposure: 2 });
		window.openlight.setNoiseReduction(100);
	});
	const filtered = await readPixels(page);
	// A global model used to leave the noisier upper-right corner nearly unfiltered.
	expect(difference(filtered, clean, [832, 16, 176, 176]).mse).toBeLessThan(2);
	expect(difference(filtered, clean, [400, 200, 176, 176]).mse).toBeLessThan(1);
	// The colored surface includes fine stripes and a small red light, above a blue wall.
	expect(
		difference(filtered, clean, [100, 660, 600, 210]).chromaMse,
	).toBeLessThan(5);
	// Stronger noise exposed a false corrugated texture in otherwise smooth sky.
	await loadFixture(page, "denoise-noisy.rough-surfaces.dng");
	await page.evaluate(() => {
		window.openlight.setAdjustments({ exposure: 2 });
		window.openlight.setNoiseReduction(100);
	});
	const rough = await readPixels(page);
	expect(difference(rough, clean, [100, 100, 650, 450]).mse).toBeLessThan(2);
	let ripple = 0;
	for (let y = 100; y < 550; y++) {
		for (let x = 100; x < 748; x++) {
			const i = (y * rough.width + x) * 4;
			let residual = 0;
			for (let c = 0; c < 3; c++) {
				residual +=
					(rough.pixels[i + c] -
						clean.pixels[i + c] -
						rough.pixels[i + 8 + c] +
						clean.pixels[i + 8 + c]) /
					3;
			}
			ripple += residual * residual;
		}
	}
	expect(ripple / (648 * 450)).toBeLessThan(2);
});

for (const format of ["png", "tif", "dng", "detail.dng", "correlated.png"]) {
	test(`noise reduction cleans ${format} without distorting the image`, async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto("/");
		await page.waitForFunction(() => window.openlight);
		await loadFixture(page, `denoise-clean.${format}`);
		const clean = await readPixels(page);
		await loadFixture(page, `denoise-noisy.${format}`);
		const noisy = await readPixels(page);
		const details = page.locator("section").filter({
			has: page.getByRole("button", { name: "Details", exact: true }),
		});
		if (format === "png") {
			await details.screenshot({
				path: test.info().outputPath("noise-reduction-neutral-ui.png"),
			});
		}

		await page.evaluate(() => window.openlight.setNoiseReduction(100));
		const filtered = await readPixels(page);
		if (format === "png") {
			await expect(
				page.getByText("Processing image…", { exact: true }),
			).toBeHidden();
			await details.screenshot({
				path: test.info().outputPath("noise-reduction-active-ui.png"),
			});
		}

		expect([filtered.width, filtered.height]).toEqual([
			clean.width,
			clean.height,
		]);
		const minimumNoise = format === "detail.dng" ? 1 : 5;
		expect(difference(noisy, clean).mse).toBeGreaterThan(minimumNoise);
		expect(difference(filtered, clean).mse).toBeLessThan(
			difference(noisy, clean).mse * 0.65,
		);
		expect(difference(filtered, clean).bias).toBeLessThan(2);
		expect(filtered.pixels.filter((_, i) => i % 4 === 3)).toEqual(
			clean.pixels.filter((_, i) => i % 4 === 3),
		);
		if (format === "correlated.png") {
			// Smooth sky, fine texture, a color boundary, and a tiny red light.
			expect(difference(filtered, clean).mse).toBeLessThan(
				difference(noisy, clean).mse * 0.25,
			);
			expect(difference(filtered, clean, [8, 8, 240, 40]).mse).toBeLessThan(6);
			expect(difference(filtered, clean, [16, 128, 64, 48]).mse).toBeLessThan(
				25,
			);
			expect(difference(filtered, clean, [16, 80, 64, 32]).mse).toBeLessThan(
				40,
			);
			expect(difference(filtered, clean, [159, 59, 3, 3]).mse).toBeLessThan(
				100,
			);
		}
		if (format === "png") {
			// Fine stripes must survive; replacing them with a flat blur must fail.
			const stripes = [32, 34, 148, 13];
			expect(difference(filtered, clean, stripes).mse).toBeLessThan(
				difference(noisy, clean, stripes).mse * 0.7,
			);
			// The fixture crosses a processing-tile boundary at x=384.
			expect(difference(filtered, clean, [380, 8, 9, 20]).mse).toBeLessThan(15);
		}
		if (format === "detail.dng") {
			// The larger Bayer fixture exercises detail, shadows and a packed-tile boundary.
			expect(difference(filtered, clean).mse).toBeLessThan(1);
			expect(difference(filtered, clean, [250, 16, 16, 288]).mse).toBeLessThan(
				2,
			);
		}
		await page.evaluate(() => window.openlight.setNoiseReduction(0));
		expect(await readPixels(page)).toEqual(noisy);
		if (format === "png") {
			await noiseReductionEditing(page);
		}
		if (format === "detail.dng") {
			await loadFixture(page, `denoise-clean.${format}`);
			await page.evaluate(() => window.openlight.setNoiseReduction(100));
			expect(difference(await readPixels(page), clean).mse).toBeLessThan(0.2);
		}
	});
}
