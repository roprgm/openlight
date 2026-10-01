import { expect, test } from "./fixtures";

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
  await page.keyboard.press("h");
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("b");
  await expect(mask).toBeVisible();
  await page.keyboard.press("b");
  await expect(color).toBeVisible();
  await page.keyboard.press("h");
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("b");
  await expect(color).toBeVisible();
  await page.keyboard.press("h");
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  for (const mode of ["Heal", "Clone", "Remove"]) {
    await page.keyboard.press("h");
    await expect(
      modes.getByRole("button", { name: mode, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.keyboard.press("c");
  await page.keyboard.press("b");
  await expect(color).toBeVisible();
  await page.keyboard.press("b");
  await expect(mask).toBeVisible();
  await page.keyboard.press("a");
  await page.keyboard.press("b");
  await expect(mask).toBeVisible();
  await page.keyboard.press("h");
  await expect(remove).toHaveAttribute("aria-pressed", "true");
});
