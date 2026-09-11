import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("RGB denoising reduces PNG noise across tiles, preserves alpha, and participates in editing", async ({
	page,
}) => {
	test.setTimeout(600_000);
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const fixture = await page.evaluate(async () => {
		const width = 401,
			height = 49;
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (!context) {
			throw Error("Cannot create fixture.");
		}
		const clean = new Uint8ClampedArray(width * height * 4);
		const noisy = new Uint8ClampedArray(clean.length);
		let seed = 42;
		const random = () => {
			seed = (1664525 * seed + 1013904223) >>> 0;
			return (seed + 1) / 4294967297;
		};
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4;
				const texture = y >= 32 ? 15 * Math.sin((x * Math.PI) / 4) : 0;
				for (let c = 0; c < 3; c++) {
					clean[i + c] =
						(x < 196 ? [75, 100, 120] : [140, 110, 85])[c] + texture;
					noisy[i + c] =
						clean[i + c] +
						10 *
							Math.sqrt(-2 * Math.log(random())) *
							Math.cos(2 * Math.PI * random());
				}
				clean[i + 3] = noisy[i + 3] = x < 8 ? 128 : 255;
			}
		}
		context.putImageData(new ImageData(noisy, width, height), 0, 0);
		const file = new File([await canvas.convertToBlob()], "noisy.png", {
			type: "image/png",
		});
		await window.openlight.loadImage(file);
		return { clean: [...clean], width, height };
	});
	const read = () =>
		page.evaluate(async () => {
			const image = await createImageBitmap(
				await window.openlight.exportImage(),
			);
			const context = new OffscreenCanvas(image.width, image.height).getContext(
				"2d",
			);
			if (!context) {
				throw Error("Cannot read export.");
			}
			context.drawImage(image, 0, 0);
			image.close();
			return [
				...context.getImageData(
					0,
					0,
					context.canvas.width,
					context.canvas.height,
				).data,
			];
		});
	const original = await read();
	await page
		.getByRole("slider", { name: "Noise reduction", exact: true })
		.focus();
	await page.keyboard.press("End");
	await expect(
		page.getByRole("slider", { name: "Noise reduction", exact: true }),
	).toHaveValue("100", { timeout: 550_000 });
	const filtered = await read();
	const error = (
		pixels: number[],
		start = 32,
		end = 390,
		top = 8,
		bottom = 28,
	) => {
		let sum = 0,
			count = 0;
		for (let y = top; y < bottom; y++) {
			for (let x = start; x < end; x++) {
				for (let c = 0; c < 3; c++) {
					const i = (y * fixture.width + x) * 4 + c;
					sum += (pixels[i] - fixture.clean[i]) ** 2;
					count++;
				}
			}
		}
		return sum / count;
	};
	expect(error(filtered)).toBeLessThan(error(original) * 0.4);
	// The 384px tile boundary must be as clean as an ordinary nearby strip.
	expect(error(filtered, 380, 389)).toBeLessThan(15);
	expect(error(filtered, 380, 389)).toBeLessThan(
		error(filtered, 356, 365) * 3 + 2,
	);
	expect(error(filtered, 32, 180, 34, 47)).toBeLessThan(
		error(original, 32, 180, 34, 47) * 0.7,
	);
	for (let i = 0; i < original.length; i++) {
		if (i % 4 === 3 || Math.floor(i / 4) % fixture.width < 8) {
			expect(filtered[i]).toBe(original[i]);
		}
	}
	await page.evaluate(() => window.openlight.undo());
	expect(await read()).toEqual(original);
	await page.evaluate(() => window.openlight.redo());
	expect(await read()).toEqual(filtered);
	await page.evaluate(() => window.openlight.setNoiseReduction(40));
	const partial = await read();
	expect(error(partial)).toBeLessThan(error(original));
	const slider = page.getByRole("slider", {
		name: "Noise reduction",
		exact: true,
	});
	await slider.focus();
	await page.keyboard.press("Home");
	await expect(slider).toHaveValue("0");
	expect(await read()).toEqual(original);
	await expect(
		page.getByRole("button", { name: "Reduce noise", exact: true }),
	).toHaveCount(0);
	await page.getByRole("button", { name: "Details", exact: true }).click();
	await page.getByRole("button", { name: "Details", exact: true }).click();
	await expect(slider).toHaveValue("0");
	await page.getByRole("tab", { name: "Crop", exact: true }).click();
	await page.getByRole("tab", { name: "Adjust", exact: true }).click();
	await expect(slider).toHaveValue("0");
	await expect(
		page.getByRole("button", { name: "Reduce noise", exact: true }),
	).toHaveCount(0);
	await slider.focus();
	await page.keyboard.press("ArrowRight");
	await expect(slider).toHaveValue("1");
	await page.evaluate(() => {
		window.openlight.setNoiseReduction(100);
		window.openlight.setAdjustments({ exposure: 0.5 });
	});
	expect(await read()).not.toEqual(filtered);
	await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0 }));
	expect(await read()).toEqual(filtered);
});

test("denoising floating RGB keeps sub-8-bit precision, HDR, and transparent pixels", async ({
	page,
}) => {
	test.setTimeout(600_000);
	// A separate page owns its device; no second vgpu initialization in the app.
	await page.route("**/denoise-test", (route) =>
		route.fulfill({
			contentType: "text/html",
			body: "<!doctype html><title>GPU test</title>",
		}),
	);
	await page.goto("/denoise-test");
	const result = await page.evaluate(async () => {
		const path = "/tests/denoise-gpu.ts";
		const { verifyFloatDenoising } = await import(/* @vite-ignore */ path);
		return verifyFloatDenoising();
	});
	expect(result.errors).toEqual([]);
	expect(result.finite).toBe(true);
	expect(result.errorAfter).toBeLessThan(result.errorBefore * 0.5);
	expect(result.hdrMinimum).toBeGreaterThan(1);
	expect(result.precisionLevels).toBeGreaterThan(4);
	expect(result.alphaExact).toBe(true);
	expect(result.transparentExact).toBe(true);
	expect(result.originalExact).toBe(true);
	expect(result.zeroBypasses).toBe(true);
});

test("16-bit TIFF and Bayer DNG use denoising through their real decoders", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	for (const extension of ["tif", "dng"]) {
		await test.step(extension, async () => {
			const load = async (kind: string) => {
				const name = `denoise-${kind}.${extension}`;
				const bytes = [...(await readFile(`tests/fixtures/${name}`))];
				await page.evaluate(
					({ bytes, name }) =>
						window.openlight.loadImage(new File([new Uint8Array(bytes)], name)),
					{ bytes, name },
				);
			};
			const pixels = () =>
				page.evaluate(async () => {
					const bitmap = await createImageBitmap(
						await window.openlight.exportImage(),
					);
					const context = new OffscreenCanvas(
						bitmap.width,
						bitmap.height,
					).getContext("2d");
					if (!context) {
						throw Error("Cannot read export.");
					}
					context.drawImage(bitmap, 0, 0);
					bitmap.close();
					return [...context.getImageData(0, 0, 64, 48).data];
				});
			await load("clean");
			const clean = await pixels();
			await load("noisy");
			await expect(
				page.getByRole("slider", { name: "Noise reduction", exact: true }),
			).toHaveValue("0");
			const original = await pixels();
			// The semantic API and UI share the same scene edit.
			await page.evaluate(() => window.openlight.setNoiseReduction(100));
			const filtered = await pixels();
			const error = (values: number[], reference = clean) => {
				let sum = 0;
				for (let y = 8; y < 40; y++) {
					for (const x of [
						...Array.from({ length: 16 }, (_, i) => i + 8),
						...Array.from({ length: 16 }, (_, i) => i + 40),
					]) {
						for (let c = 0; c < 3; c++) {
							const i = (y * 64 + x) * 4 + c;
							sum += (values[i] - reference[i]) ** 2;
						}
					}
				}
				return sum / (32 * 32 * 3);
			};
			expect(error(original)).toBeGreaterThan(5);
			expect(error(filtered)).toBeLessThan(error(original) * 0.65);
			expect(filtered.every((v, i) => i % 4 !== 3 || v === original[i])).toBe(
				true,
			);
			await page.evaluate(() => window.openlight.setNoiseReduction(0));
			const slider = page.getByRole("slider", {
				name: "Noise reduction",
				exact: true,
			});
			await expect(slider).toHaveValue("0");
			await expect(
				page.getByRole("button", { name: "Reduce noise", exact: true }),
			).toHaveCount(0);
			expect(await pixels()).toEqual(original);
			await slider.focus();
			await page.keyboard.press("End");
			await expect(slider).toHaveValue("100");
			expect(await pixels()).toEqual(filtered);
			await page.evaluate(() => window.openlight.undo());
			expect(await pixels()).toEqual(original);
			await page.evaluate(() => window.openlight.redo());
			expect(await pixels()).toEqual(filtered);
			if (extension === "dng") {
				await page.evaluate(() =>
					window.openlight.setWhiteBalance({ temperature: 2000, tint: 20 }),
				);
				const coolFiltered = await pixels();
				await page.evaluate(() => window.openlight.setNoiseReduction(0));
				const coolNoisy = await pixels();
				expect(coolFiltered).not.toEqual(filtered);
				await load("clean");
				await page.evaluate(() =>
					window.openlight.setWhiteBalance({ temperature: 2000, tint: 20 }),
				);
				const coolClean = await pixels();
				// Extreme WB changes channel correlations; require improvement, not the As Shot reduction ratio.
				expect(error(coolFiltered, coolClean)).toBeLessThan(
					error(coolNoisy, coolClean),
				);
			}
		});
	}
});

test("linear JPEG XL DNG needs no mosaic and keeps white balance correct with denoising enabled", async ({
	page,
}) => {
	const bytes = [...(await readFile("tests/fixtures/raw/linear-jxl.dng"))];
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await page.evaluate(
		(bytes) =>
			window.openlight.loadImage(
				new File([new Uint8Array(bytes)], "linear-jxl.dng"),
			),
		bytes,
	);
	for (const temperature of [6500, 2000]) {
		await page.evaluate((temperature) => {
			window.openlight.setWhiteBalance({ temperature, tint: 20 });
			window.openlight.setNoiseReduction(0);
		}, temperature);
		const original = await readImage(page);
		await page.evaluate(() => window.openlight.setNoiseReduction(100));
		const filtered = await readImage(page);
		for (let c = 0; c < 4; c++) {
			expect(
				Math.abs(filtered.center[c] - original.center[c]),
			).toBeLessThanOrEqual(1);
		}
	}
});
