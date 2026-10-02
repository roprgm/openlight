import { expect, test } from "./fixtures";

test("Enter leaves retouch after selecting a patch by mouse or keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  await page.keyboard.press("h");
  const canvas = page.getByLabel("Healing canvas", { exact: true });
  const size = page.getByRole("textbox", { name: "Size", exact: true });
  await size.fill("20");
  await size.press("Enter");
  await canvas.click({ position: { x: 600, y: 500 } });
  const patch = page.getByRole("button", {
    name: "Select patch 1",
    exact: true,
  });
  await expect(patch).toHaveAttribute("aria-pressed", "true");
  const state = await page.evaluate(() => window.openlight.getState());
  await patch.click();
  await expect(patch).not.toBeFocused();
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Adjust", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => window.openlight.getState())).toEqual(state);
  // Explicit keyboard activation still selects a patch and returns control to the canvas.
  await patch.focus();
  await patch.press("Enter");
  await expect(canvas).toBeVisible();
  await expect(patch).not.toBeFocused();
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveCount(0);
  expect(await page.evaluate(() => window.openlight.getState())).toEqual(state);
});

test("tool shortcuts restore remembered submodes and cycle only the active tool", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  const modes = page.getByRole("group", { name: "Retouch mode" });
  const remove = modes.getByRole("button", { name: "Remove", exact: true });
  const mask = page.getByLabel("Brush canvas", { exact: true });
  const color = page.getByLabel("Paint canvas", { exact: true });
  await page.keyboard.press("h");
  await remove.click();
  await page.keyboard.press("b");
  await expect(mask).toBeVisible();
  await page.keyboard.press("b");
  await expect(color).toBeVisible();
  await page.keyboard.press("h");
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("b");
  await expect(color).toBeVisible();
  await page.keyboard.press("b");
  await expect(mask).toBeVisible();
  await page.keyboard.press("c");
  await page.keyboard.press("b");
  await expect(mask).toBeVisible();
});
