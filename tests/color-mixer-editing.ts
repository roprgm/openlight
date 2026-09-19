import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { box, drag } from "./pointer";

export async function colorMixerEditing(page: Page) {
	const state = () => page.evaluate(() => window.openlight.getState());
	await test.step("color mixer switches channels, groups vertical drags, exports selected colors and resets", async () => {
		await page.getByRole("button", { name: "Add effect", exact: true }).click();
		await page
			.locator("[popover]:popover-open")
			.getByRole("button", { name: "Color Mixer", exact: true })
			.click();
		const before = (await state()).history.undoCount;
		const hue = page.getByRole("slider", { name: "Blue hue", exact: true });
		await hue.scrollIntoViewIfNeeded();
		await expect(hue).toHaveAttribute("aria-orientation", "vertical");
		const bounds = await box(hue);
		expect(bounds.height).toBeGreaterThan(bounds.width * 3);
		await hue.press("ArrowUp");
		await expect(hue).toHaveValue("1");
		expect((await state()).history.undoCount).toBe(before + 1);
		await page.keyboard.press("ControlOrMeta+z");
		await expect(hue).toHaveValue("0");
		const beforeTabs = await state();
		await page
			.getByRole("tab", { name: "Hue", exact: true })
			.press("ArrowRight");
		await expect(
			page.getByRole("tab", { name: "Saturation", exact: true }),
		).toHaveAttribute("aria-selected", "true");
		expect(await state()).toEqual(beforeTabs);
		const saturation = page.getByRole("slider", {
			name: "Blue saturation",
			exact: true,
		});
		const track = await box(saturation);
		await drag(
			page,
			[track.x + track.width / 2, track.y + track.height / 2],
			[track.x + track.width / 2, track.y + track.height / 4],
		);
		const dragged = (await state()).colorMixer.saturation[5];
		expect(dragged).toBeGreaterThan(0);
		expect((await state()).history.undoCount).toBe(before + 1);
		await page.keyboard.press("ControlOrMeta+z");
		await expect(saturation).toHaveValue("0");
		await page.keyboard.press("ControlOrMeta+Shift+z");
		await expect(saturation).toHaveValue(String(dragged));
		const numeric = page.getByRole("textbox", {
			name: "Blue saturation value",
			exact: true,
		});
		await numeric.fill("-100");
		await numeric.press("Enter");
		await expect(saturation).toHaveValue("-100");
		const pixel = await page.evaluate(async () => {
			const bitmap = await createImageBitmap(
				await window.openlight.exportImage(),
			);
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Cannot read color mixer export.");
			context.drawImage(bitmap, 0, 0);
			bitmap.close();
			return [...context.getImageData(350, 200, 1, 1).data];
		});
		for (const channel of pixel.slice(0, 3)) {
			expect(Math.abs(channel - 79)).toBeLessThanOrEqual(2);
		}
		expect(pixel[3]).toBe(255);
		await page.getByRole("tab", { name: "Luminance", exact: true }).click();
		await expect(
			page.getByRole("slider", { name: "Blue luminance", exact: true }),
		).toHaveValue("0");
		await page.getByRole("tab", { name: "Saturation", exact: true }).click();
		await expect(saturation).toHaveValue("-100");
		await saturation.dblclick();
		await expect(saturation).toHaveValue("0");
		await page.keyboard.press("ControlOrMeta+z");
		await expect(saturation).toHaveValue("-100");
		await page.keyboard.press("ControlOrMeta+Shift+z");
		await expect(saturation).toHaveValue("0");
	});
	await page.getByRole("button", { name: "photo.svg", exact: true }).click();
}
