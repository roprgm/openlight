import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { box, drag } from "./pointer";

export async function noiseReductionEditing(page: Page) {
	await test.step("noise reduction groups slider edits, undoes, redoes and resets", async () => {
		const state = () => page.evaluate(() => window.openlight.getState());
		const before = (await state()).history.undoCount;
		const slider = page.getByRole("slider", {
			name: "Noise reduction",
			exact: true,
		});
		await slider.scrollIntoViewIfNeeded();
		await expect(slider).toHaveValue("0");
		await slider.press("ArrowRight");
		await expect(slider).toHaveValue("1");
		await page.keyboard.press("ControlOrMeta+z");
		await expect(slider).toHaveValue("0");
		const track = await box(slider);
		await drag(
			page,
			[track.x + 2, track.y + track.height / 2],
			[track.x + track.width * 0.6, track.y + track.height / 2],
		);
		const amount = (await state()).noiseReduction;
		expect(amount).toBeGreaterThan(40);
		expect((await state()).history.undoCount).toBe(before + 1);
		await page.keyboard.press("ControlOrMeta+z");
		await expect(slider).toHaveValue("0");
		await page.keyboard.press("ControlOrMeta+Shift+z");
		await expect(slider).toHaveValue(String(amount));
		const field = page.getByRole("textbox", {
			name: "Noise reduction",
			exact: true,
		});
		await field.fill("75");
		await field.press("Enter");
		await expect(slider).toHaveValue("75");
		await slider.press("End");
		await expect(slider).toHaveValue("100");
		await slider.dblclick({
			position: { x: track.width - 2, y: track.height / 2 },
		});
		await expect(slider).toHaveValue("0");
		await page.keyboard.press("ControlOrMeta+z");
		await expect(slider).toHaveValue("100");
		await page.keyboard.press("ControlOrMeta+Shift+z");
		await expect(slider).toHaveValue("0");
	});
}
