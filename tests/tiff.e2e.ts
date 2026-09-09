import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

const directory = "src/lib/tiff-gpu/fixtures";

test("TIFF and DNG files open through the loader with their color, orientation, and headroom", async ({
	page,
}) => {
	const wasmRequests: string[] = [];
	page.on("request", (request) => {
		if (request.url().endsWith(".wasm")) wasmRequests.push(request.url());
	});
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const load = async (name: string, folder = directory) => {
		const bytes = [...(await readFile(`${folder}/${name}`))];
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
	// The blue pixel brightens without losing its hue, then approaches white.
	await load("blue-float.tif", "tests/fixtures");
	const colors = [];
	for (const exposure of [0, 2, 5]) {
		await page.evaluate(
			(exposure) => window.openlight.setAdjustments({ exposure }),
			exposure,
		);
		colors.push((await readImage(page)).center.slice(0, 3));
	}
	for (const rgb of colors.slice(0, 2)) {
		expect(rgb[2] - Math.max(rgb[0], rgb[1])).toBeGreaterThan(20);
	}
	const brightness = colors.map((rgb) =>
		rgb.reduce((sum, value) => sum + value, 0),
	);
	expect(brightness[1]).toBeGreaterThan(brightness[0]);
	const white = colors[2];
	expect(Math.min(...white)).toBeGreaterThan(240);
	expect(Math.max(...white) - Math.min(...white)).toBeLessThan(10);
	// Bayer DNG files develop through the same loader; the second is lossless JPEG, rotated, and cropped.
	await load("bayer.dng", "src/lib/camera-raw/fixtures");
	expect((await readImage(page)).size).toEqual([64, 48]);
	await test.step("RAW Kelvin/tint changes reach export, reset, and undo", async () => {
		const asShot = await page.evaluate(
			() => window.openlight.getState().whiteBalance,
		);
		expect(asShot?.temperature).toBeGreaterThanOrEqual(2000);
		const original = await readImage(page);
		await page.evaluate(() =>
			window.openlight.setWhiteBalance({ temperature: 2000, tint: 0 }),
		);
		const cold = await readImage(page);
		await page.evaluate(() =>
			window.openlight.setWhiteBalance({ temperature: 12000, tint: 0 }),
		);
		const warm = await readImage(page);
		const blueMinusRed = (image: typeof cold) =>
			image.center[2] - image.center[0];
		expect(blueMinusRed(cold)).toBeGreaterThan(blueMinusRed(warm) + 20);
		await page.evaluate(() => window.openlight.setWhiteBalance({ tint: 80 }));
		const magenta = await readImage(page);
		await page.evaluate(() => window.openlight.setWhiteBalance({ tint: -80 }));
		const green = await readImage(page);
		const greenExcess = (image: typeof cold) =>
			image.center[1] - (image.center[0] + image.center[2]) / 2;
		expect(greenExcess(green)).toBeGreaterThan(greenExcess(magenta) + 10);
		await expect(
			page.getByRole("slider", { name: "Temperature (K)", exact: true }),
		).toBeVisible();
		await page.getByRole("button", { name: "As Shot", exact: true }).click();
		expect(await readImage(page)).toEqual(original);
		expect(
			await page.evaluate(() => window.openlight.getState().whiteBalance),
		).toEqual(asShot);
		await page.evaluate(() => window.openlight.undo());
		expect(await readImage(page)).toEqual(green);
		await page.evaluate(() => window.openlight.redo());
		expect(await readImage(page)).toEqual(original);
		// A normal image exposes relative controls again, even when the previous source was RAW.
		await load("gray16-para.tif");
		expect(
			await page.evaluate(() => window.openlight.getState().whiteBalance),
		).toBeUndefined();
		await expect(
			page.getByRole("slider", { name: "Temperature (K)", exact: true }),
		).toHaveCount(0);
		expect(
			await page.evaluate(() => {
				try {
					window.openlight.setWhiteBalance({ temperature: 5000 });
					return false;
				} catch {
					return true;
				}
			}),
		).toBe(true);
	});
	await load("bayer-ljpeg.dng", "src/lib/camera-raw/fixtures");
	expect((await readImage(page)).size).toEqual([44, 56]);
	// LinearRaw contains complete RGB pixels; both codecs must preserve the same colors without interpolation.
	await load("linear.dng", "src/lib/camera-raw/fixtures");
	const linear = await readImage(page);
	expect(linear.size).toEqual([8, 12]);
	expect(linear.center[3]).toBe(255);
	expect(
		Math.max(...linear.center.slice(0, 3)) -
			Math.min(...linear.center.slice(0, 3)),
	).toBeGreaterThan(20);
	await load("linear-ljpeg.dng", "src/lib/camera-raw/fixtures");
	expect(await readImage(page)).toEqual(linear);
	expect(wasmRequests).toHaveLength(0);
	await load("linear-jxl.dng", "src/lib/camera-raw/fixtures");
	expect(await readImage(page)).toEqual(linear);
	expect(wasmRequests).toHaveLength(1);
	// Profile exposure and the spatial gain map must also survive worker transfer and export.
	await load("profile-reference.tif", "src/lib/camera-raw/fixtures");
	const profile = await readImage(page);
	await load("profile.dng", "src/lib/camera-raw/fixtures");
	const developed = await readImage(page);
	expect(developed.size).toEqual(profile.size);
	for (let c = 0; c < 4; c++) {
		expect(
			Math.abs(developed.center[c] - profile.center[c]),
		).toBeLessThanOrEqual(2);
	}
	// A crashed worker must report its error and allow the next file to open.
	const workerScript = (url: URL) =>
		url.searchParams.has("worker_file") ||
		/\/image.worker-[^/]+\.js$/.test(url.pathname);
	await page.route(workerScript, (route) =>
		route.fulfill({
			contentType: "text/javascript",
			body: 'throw new Error("Synthetic worker failure");',
		}),
	);
	await load("linear.dng", "src/lib/camera-raw/fixtures");
	await expect(
		page.getByText("Synthetic worker failure", { exact: false }),
	).toBeVisible();
	await page.unroute(workerScript);
	await load("linear.dng", "src/lib/camera-raw/fixtures");
	expect(await readImage(page)).toEqual(linear);
	await load("rgb8-jpeg.tif");
	await expect(
		page.getByText("Couldn't open rgb8-jpeg.tif:", { exact: false }),
	).toBeVisible();
});
