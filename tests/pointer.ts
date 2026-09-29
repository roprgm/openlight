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

/** Zooms the canvas under the pointer as a Control-wheel gesture does. */
export async function zoom(page: Page, factor: number) {
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -Math.log(factor) * 100);
  await page.keyboard.up("Control");
}

/** Chooses from OpenLight's custom select surface through the visible UI. */
export async function choose(page: Page, select: Locator, option: string) {
  await select.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
