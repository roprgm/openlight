import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box, choose, drag } from "./pointer";

const gray = [128, 128, 128, 255];

/** Export pixels inside the strokes and far above them. */
async function samples(page: Page) {
  const { samples } = await readImage(page, undefined, [
    [600, 400],
    [600, 100],
  ]);
  return samples ?? [];
}

test("paint colors on a layer, swap them, erase, blend, and switch to a mask", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const kinds = async () =>
    (await page.evaluate(() => window.openlight.getState())).scene?.layers.map(
      (layer) => layer.kind,
    );
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  await page.getByRole("tab", { name: "Brush", exact: true }).click();
  const options = page.getByRole("group", { name: "Layer options" });
  const color = options.getByRole("button", { name: "Color", exact: true });
  const mask = options.getByRole("button", { name: "Mask", exact: true });
  await expect(mask).toHaveAttribute("aria-pressed", "true");
  await color.click();
  const canvas = page.getByLabel("Paint canvas", { exact: true });
  await expect(canvas).toBeVisible();
  // The untouched brush mask gives way to a paint layer.
  expect(await kinds()).toEqual(["image", "paint"]);
  const size = options.getByRole("textbox", { name: "Size", exact: true });
  await size.fill("200");
  await size.press("Enter");
  const bounds = await box(canvas);
  const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
  const center = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  const from = [center[0] - 150 * scale, center[1]];
  const to = [center[0] + 150 * scale, center[1]];
  await test.step("a stroke paints the primary color", async () => {
    await options.getByLabel("Primary color").fill("#ff0000");
    await drag(page, from, to, 16);
    expect(await samples(page)).toEqual([[255, 0, 0, 255], gray]);
  });
  await test.step("X swaps in the secondary color, white", async () => {
    await page.keyboard.press("x");
    await drag(page, from, to, 16);
    expect(await samples(page)).toEqual([[255, 255, 255, 255], gray]);
  });
  await test.step("Multiply by white leaves the image as it was", async () => {
    await choose(
      page,
      page.getByRole("combobox", { name: "Blend" }),
      "Multiply",
    );
    expect(await samples(page)).toEqual([gray, gray]);
    await page.keyboard.press("ControlOrMeta+z");
  });
  await test.step("Alt erases the paint, and undo brings it back", async () => {
    await page.keyboard.down("Alt");
    await drag(page, from, to, 16);
    await page.keyboard.up("Alt");
    expect(await samples(page)).toEqual([gray, gray]);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await samples(page)).toEqual([[255, 255, 255, 255], gray]);
  });
  await test.step("the mode follows the selected layer", async () => {
    await mask.click();
    await expect(
      page.getByLabel("Brush canvas", { exact: true }),
    ).toBeVisible();
    expect(await kinds()).toEqual(["image", "paint", "mask"]);
    // Choosing the paint layer leaves the tool, and the untouched mask with it; B paints on the layer again.
    await page
      .getByRole("button", { name: "Select Paint", exact: true })
      .click();
    expect(await kinds()).toEqual(["image", "paint"]);
    await page.keyboard.press("b");
    await expect(color).toHaveAttribute("aria-pressed", "true");
    await expect(canvas).toBeVisible();
    expect(await kinds()).toEqual(["image", "paint"]);
  });
});
