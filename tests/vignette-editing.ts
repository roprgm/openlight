import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { box, drag } from "./pointer";

/** Read the real preview canvas before browser window compositing. */
async function readCanvasPixel(page: Page, point: { x: number; y: number }) {
	return page.evaluate(async ({ x, y }) => {
		const source = document.querySelector("canvas");
		if (!source) {
			throw new Error("Missing preview canvas.");
		}
		const bounds = source.getBoundingClientRect();
		const blob = await (await fetch(source.toDataURL())).blob();
		const bitmap = await createImageBitmap(blob);
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Cannot read preview canvas.");
		}
		context.drawImage(bitmap, 0, 0);
		bitmap.close();
		return [
			...context.getImageData(
				((x - bounds.x) * canvas.width) / bounds.width,
				((y - bounds.y) * canvas.height) / bounds.height,
				1,
				1,
			).data,
		];
	}, point);
}

export async function vignetteEditing(page: Page) {
	await test.step("vignette controls group edits, update the histogram and match export through zoom and pan", async () => {
		const state = () => page.evaluate(() => window.openlight.getState());
		const before = await state();
		const canvas = page.locator("canvas");
		const histogram = page
			.getByLabel("output histogram", { exact: true })
			.locator("polyline")
			.first();
		await expect(histogram).toHaveAttribute("points", /,\d{1,2}\./);
		const originalHistogram = await histogram.getAttribute("points");
		const intensity = page.getByRole("slider", {
			name: "Intensity",
			exact: true,
		});
		const softness = page.getByRole("slider", {
			name: "Softness",
			exact: true,
		});
		await intensity.scrollIntoViewIfNeeded();
		const track = await box(intensity);
		await drag(
			page,
			[track.x + 6, track.y + track.height / 2],
			[track.x + track.width * 0.8, track.y + track.height / 2],
		);
		expect((await state()).vignette.intensity).toBeGreaterThan(60);
		expect((await state()).history.undoCount).toBe(
			before.history.undoCount + 1,
		);
		await page.keyboard.press("ControlOrMeta+z");
		await expect(intensity).toHaveValue("0");
		await page.keyboard.press("ControlOrMeta+Shift+z");
		expect((await state()).vignette.intensity).toBeGreaterThan(60);
		for (const [name, value] of [
			["Intensity", "80"],
			["Softness", "100"],
		]) {
			const field = page.getByRole("textbox", { name, exact: true });
			await field.fill(value);
			await field.press("Enter");
		}
		await expect(histogram).not.toHaveAttribute(
			"points",
			originalHistogram ?? "",
		);
		await softness.press("ArrowLeft");
		await expect(softness).toHaveValue("99");
		await softness.press("ArrowRight");
		await expect(softness).toHaveValue("100");
		const exported = await page.evaluate(async () => {
			const bitmap = await createImageBitmap(
				await window.openlight.exportImage(),
			);
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const context = canvas.getContext("2d");
			if (!context) {
				throw new Error("Cannot read vignette export.");
			}
			context.drawImage(bitmap, 0, 0);
			bitmap.close();
			return [600, 800, 950].map((x) => [
				...context.getImageData(x, 400, 1, 1).data,
			]);
		});
		expect(exported[0]).toEqual([128, 128, 128, 255]);
		expect(exported[1][0]).toBeLessThan(128);
		expect(exported[2][0]).toBeLessThan(exported[1][0]);
		const viewport = await box(canvas);
		const scale = Math.min(
			(viewport.width - 48) / 1200,
			(viewport.height - 48) / 800,
			2,
		);
		const center = {
			x: viewport.x + viewport.width / 2,
			y: viewport.y + viewport.height / 2,
		};
		async function expectSample(factor: number, panX = 0, panY = 0) {
			const point = {
				x: center.x + 200 * scale * factor + panX,
				y: center.y + panY,
			};
			await expect
				.poll(async () => {
					const pixel = await readCanvasPixel(page, point);
					return Math.max(
						...pixel.map((value, i) => Math.abs(value - exported[1][i])),
					);
				})
				.toBeLessThanOrEqual(2);
		}
		await expectSample(1);
		await page.getByRole("button", { name: "Zoom in", exact: true }).click();
		await expectSample(1.25);
		const edited = await state();
		await page.keyboard.down("Space");
		await drag(page, [center.x, center.y], [center.x + 35, center.y + 20]);
		await page.keyboard.up("Space");
		await expectSample(1.25, 35, 20);
		expect(await state()).toEqual(edited);
		await page.keyboard.down("Backslash");
		await expect
			.poll(() =>
				readCanvasPixel(page, {
					x: center.x + 200 * scale * 1.25 + 35,
					y: center.y + 20,
				}),
			)
			.toEqual([128, 128, 128, 255]);
		await page.keyboard.up("Backslash");
		await expectSample(1.25, 35, 20);
		await canvas.dblclick();
		await intensity.dblclick();
		await expect(intensity).toHaveValue("0");
		await expect(histogram).toHaveAttribute("points", originalHistogram ?? "");
		await softness.dblclick();
		await expect(softness).toHaveValue("50");
	});
}
