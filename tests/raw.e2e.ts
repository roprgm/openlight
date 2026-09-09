import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { readImage, readPreview } from "./images";

declare global {
	interface Window {
		rawPixelTransfers: number[];
	}
}

test("RAW Bayer and JPEG XL DNG preserve color, orientation, white balance, history and export", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const replies: number[] = [];
		Object.assign(window, { rawPixelTransfers: replies });
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				this.addEventListener("message", ({ data }) => {
					replies.push(
						data.image?.data.byteLength ?? data.data?.byteLength ?? 0,
					);
				});
			}
		};
	});
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const load = async (name: string, mime = "image/tiff") => {
		const bytes = [...(await readFile(`tests/fixtures/raw/${name}`))];
		await page.evaluate(
			({ bytes, name, mime }) =>
				window.openlight.loadImage(
					new File([new Uint8Array(bytes)], name, { type: mime }),
				),
			{ bytes, name, mime },
		);
	};
	for (const name of ["bayer.dng", "linear-jxl.dng"]) {
		await test.step(name, async () => {
			await load(name);
			const image = await readImage(page);
			expect(image.size).toEqual([96, 128]);
			// The fixture's camera profile is sRGB with known linear samples .5, .25, .125.
			for (const [i, expected] of [188, 137, 99, 255].entries()) {
				expect(Math.abs(image.center[i] - expected)).toBeLessThanOrEqual(1);
			}
			const asShot = await page.evaluate(
				() => window.openlight.getState().whiteBalance,
			);
			expect(asShot?.temperature).toBeGreaterThan(6000);
			await expect(
				page.getByRole("slider", { name: "Temperature (K)", exact: true }),
			).toBeVisible();
			const beforeEdit = await page.evaluate(
				() => window.rawPixelTransfers.length,
			);
			await page.evaluate(() =>
				window.openlight.setWhiteBalance({ temperature: 4000, tint: 20 }),
			);
			const cool = await readImage(page);
			// Full SDK camera calibration, including its white-point normalization.
			for (const [i, expected] of [192, 161, 166, 255].entries()) {
				expect(Math.abs(cool.center[i] - expected)).toBeLessThanOrEqual(1);
			}
			await expect
				.poll(async () => (await readPreview(page)).center.slice(0, 3))
				.toEqual(cool.center.slice(0, 3));
			const transfers = await page.evaluate(
				(start) => window.rawPixelTransfers.slice(start),
				beforeEdit,
			);
			expect(transfers.length).toBeGreaterThan(0);
			expect(transfers).toEqual(transfers.map(() => 0));
			await page.evaluate(() => window.openlight.undo());
			expect((await readImage(page)).center).toEqual(image.center);
			await page.evaluate(() => window.openlight.redo());
			expect((await readImage(page)).center).toEqual(cool.center);
			await page.getByRole("button", { name: "As Shot", exact: true }).click();
			expect(
				await page.evaluate(() => window.openlight.getState().whiteBalance),
			).toEqual(asShot);
			expect((await readImage(page)).center).toEqual(image.center);
		});
	}
	// A renderer exporting a captured scene owns its source while the workspace replaces it.
	const bytes = [...(await readFile("tests/fixtures/raw/bayer.dng"))];
	const replacement = await page.evaluate(async (bytes) => {
		window.openlight.setWhiteBalance({ temperature: 4000, tint: 20 });
		const exporting = window.openlight.exportImage();
		await window.openlight.loadImage(
			new File([new Uint8Array(bytes)], "replacement.dng"),
		);
		const image = await createImageBitmap(await exporting);
		const size = [image.width, image.height];
		image.close();
		return size;
	}, bytes);
	expect(replacement).toEqual([96, 128]);
	await page.evaluate(() =>
		window.openlight.loadImage(new File(["invalid RAW"], "broken.dng")),
	);
	await expect(
		page.getByText("Couldn't open broken.dng:", { exact: false }),
	).toBeVisible();
	await load("linear-jxl.dng");
	expect((await readImage(page)).size).toEqual([96, 128]);
});
