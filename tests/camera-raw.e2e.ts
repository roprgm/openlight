import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import cameras from "./fixtures/camera-raw/cameras.json" with { type: "json" };
import { readImage } from "./images";

test("RAW white balance, highlight roll-off, history and export preserve sensor colors", async ({
	page,
}) => {
	await page.goto("/");
	await page
		.locator('input[type="file"]')
		.setInputFiles("tests/fixtures/camera-raw/basic.dng");
	const field = page.getByRole("textbox", {
		name: "Temperature (K)",
		exact: true,
	});
	await expect(field).toHaveValue("6505");
	const original = await readImage(page);
	await field.fill("3000");
	await field.press("Enter");
	const changed = await readImage(page);
	// Independent Krystek/CIE-uv calculation and camera-to-Rec.2020 conversion.
	for (const [channel, value] of [136, 137, 185, 255].entries()) {
		expect(Math.abs(changed.center[channel] - value)).toBeLessThanOrEqual(2);
	}
	await page.evaluate(() => window.openlight.undo());
	expect(await readImage(page)).toEqual(original);
	await page.evaluate(() => window.openlight.redo());
	expect(await readImage(page)).toEqual(changed);
	await page.getByRole("button", { name: "As Shot", exact: true }).click();
	expect(await readImage(page)).toEqual(original);
	const points = await page.evaluate(
		async (bytes) => {
			const api = window.openlight;
			await api.loadImage(
				new File([new Uint8Array(bytes)], "highlights.DNG", {
					type: "image/tiff",
				}),
			);
			const pixels = await api.readSourcePixels();
			return [
				[16, 16],
				[112, 64],
				[16, 40],
			].map(([x, y]) => [
				...pixels.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 3),
			]);
		},
		[...(await readFile("tests/fixtures/camera-raw/highlights.dng"))],
	);
	for (const neutral of points.slice(1)) {
		expect(Math.max(...neutral) - Math.min(...neutral)).toBeLessThan(0.01);
		expect(Math.min(...neutral)).toBeGreaterThan(1);
	}
	for (const [channel, value] of [
		1.71061147, 0.10092175, 0.15302912,
	].entries()) {
		expect(Math.abs(points[0][channel] - value)).toBeLessThan(0.003);
	}
	const wasm: string[] = [];
	page.on("request", (request) => {
		if (request.url().endsWith(".wasm")) {
			wasm.push(request.url());
		}
	});
	await page.goto("/");
	await page
		.locator('input[type="file"]')
		.setInputFiles("src/lib/tiff-gpu/fixtures/rgb16-le.tif");
	await expect(
		page.getByRole("slider", { name: "Temp", exact: true }),
	).toBeVisible();
	await expect(field).toHaveCount(0);
	expect(wasm).toEqual([]);
});

test("native cameras match independent GPU development references", async ({
	page,
}) => {
	test.setTimeout(120000);
	const directory = process.env.OPENLIGHT_RAW_FIXTURES;
	test.skip(
		!directory,
		"Set OPENLIGHT_RAW_FIXTURES to the verified camera corpus.",
	);
	for (const camera of cameras) {
		await page.goto("/");
		await page
			.locator('input[type="file"]')
			.setInputFiles(`${directory}/${camera.name}`);
		await page.waitForFunction(() => window.openlight.getState().documentId);
		const result = await page.evaluate(async (points) => {
			const pixels = await window.openlight.readSourcePixels();
			const size = window.openlight.getState().size;
			if (!size) {
				throw Error("RAW did not open.");
			}
			return {
				size,
				points: points.map(({ x, y }) => [
					...pixels.slice((y * size[0] + x) * 4, (y * size[0] + x) * 4 + 3),
				]),
			};
		}, camera.points);
		expect(result.size).toEqual(camera.size);
		for (let p = 0; p < camera.points.length; p++) {
			for (let c = 0; c < 3; c++) {
				expect(
					Math.abs(result.points[p][c] - camera.points[p].rgb[c]),
				).toBeLessThan(0.001);
			}
		}
	}
});
