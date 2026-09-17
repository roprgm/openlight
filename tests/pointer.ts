import type { Locator, Page } from "@playwright/test";

export async function box(locator: Locator) {
	const bounds = await locator.boundingBox();
	if (!bounds) {
		throw new Error(`Missing bounds for ${locator}`);
	}
	return bounds;
}

export async function drag(
	page: Page,
	from: number[],
	to: number[],
	steps = 8,
) {
	await page.mouse.move(from[0], from[1]);
	await page.mouse.down();
	await page.mouse.move(to[0], to[1], { steps });
	await page.mouse.up();
}
