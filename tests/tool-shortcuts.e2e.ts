import { expect, openPhoto, test } from "./fixtures";

test("tool shortcuts switch the brush and its settings, remember submodes, and Enter leaves retouch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPhoto(page);
  const brushBar = page.getByRole("group", { name: "Layer options" });
  const field = (name: string) =>
    brushBar.getByRole("textbox", { name, exact: true });
  const chip = (name: string) =>
    brushBar.getByRole("button", { name, exact: true });
  const mask = page.getByLabel("Brush canvas", { exact: true });
  const color = page.getByLabel("Paint canvas", { exact: true });
  const healing = page.getByLabel("Healing canvas", { exact: true });

  await test.step("Photoshop's keys switch the brush, its colors, feather, flow, and opacity", async () => {
    await page.keyboard.press("b");
    await expect(chip("Mask")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("b");
    await expect(chip("Color")).toHaveAttribute("aria-pressed", "true");

    const primary = page.getByLabel("Primary color");
    await primary.fill("#ff0000");
    await page.keyboard.press("d");
    await expect(primary).toHaveValue("#000000");

    await page.keyboard.press("Shift+BracketRight");
    await expect(field("Feather")).toHaveValue("60");
    await page.keyboard.press("5");
    await expect(field("Flow")).toHaveValue("50");
    await page.keyboard.press("Shift+Digit3");
    await expect(field("Opacity")).toHaveValue("30");

    // On a mask, X paints or erases, as black and white do in Photoshop.
    await page.keyboard.press("b");
    await expect(chip("Mask")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("x");
    await expect(chip("Erase")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("x");
    await expect(chip("Paint")).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("tools restore remembered submodes and cycle only the active tool", async () => {
    const remove = page
      .getByRole("group", { name: "Retouch mode" })
      .getByRole("button", { name: "Remove", exact: true });
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

  await test.step("Enter leaves retouch after selecting a patch by mouse or keyboard", async () => {
    await page.keyboard.press("h");
    await page
      .getByRole("group", { name: "Retouch mode" })
      .getByRole("button", { name: "Heal", exact: true })
      .click();
    const size = page.getByRole("textbox", { name: "Size", exact: true });
    await size.fill("20");
    await size.press("Enter");
    await healing.click({ position: { x: 600, y: 500 } });
    const patch = page.getByRole("button", {
      name: "Select patch 1",
      exact: true,
    });
    await expect(patch).toHaveAttribute("aria-pressed", "true");
    // The patch's edit stays open until Heal has found its source.
    await expect
      .poll(() => page.evaluate(() => window.openlight.getState().history))
      .toMatchObject({ editing: false });
    const state = await page.evaluate(() => window.openlight.getState());
    await patch.click();
    await expect(patch).not.toBeFocused();
    await page.keyboard.press("Enter");
    await expect(healing).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "Adjust", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => window.openlight.getState())).toEqual(
      state,
    );
    // Explicit keyboard activation still selects a patch and returns control to the canvas.
    await patch.focus();
    await patch.press("Enter");
    await expect(healing).toBeVisible();
    await expect(patch).not.toBeFocused();
    await page.keyboard.press("Enter");
    await expect(healing).toHaveCount(0);
    expect(await page.evaluate(() => window.openlight.getState())).toEqual(
      state,
    );
  });
});
