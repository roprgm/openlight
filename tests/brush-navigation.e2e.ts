import { expect, test } from "./fixtures";
import { readPixel } from "./images";
import { box } from "./pointer";

for (const { name, shortcut, presses, label } of [
  { name: "mask", shortcut: "b", presses: 1, label: "Brush canvas" },
  { name: "color", shortcut: "b", presses: 2, label: "Paint canvas" },
  { name: "retouch", shortcut: "h", presses: 3, label: "Healing canvas" },
]) {
  test(`${name} brush menu owns clicks and slider drags without painting or navigating`, async ({
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
    for (let i = 0; i < presses; i++) await page.keyboard.press(shortcut);
    const canvas = page.getByLabel(label, { exact: true });
    await expect(canvas).toBeVisible();
    const state = await page.evaluate(() => window.openlight.getState());
    const zoom = page.getByRole("button", { name: /^\d+%$/ });
    const fit = await zoom.innerText();
    await canvas.click({ button: "right", position: { x: 300, y: 300 } });
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    const size = menu.getByRole("textbox", { name: "Size", exact: true });
    await size.click();
    await size.fill("80");
    await size.press("Enter");
    const feather = menu.getByRole("textbox", { name: "Feather", exact: true });
    await feather.click();
    await feather.fill("30");
    await feather.press("Enter");
    for (const name of ["Size", "Feather"]) {
      const thumb = menu.getByRole("slider", { name, exact: true });
      const initial = await thumb.getAttribute("aria-valuenow");
      const bounds = await box(thumb);
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + bounds.width / 2 + 30,
        bounds.y + bounds.height / 2,
        { steps: 4 },
      );
      await page.mouse.up();
      await expect(thumb).not.toHaveAttribute("aria-valuenow", initial ?? "");
    }
    // The viewport capture phase must also leave portaled controls alone while Space is held.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await page.keyboard.down("Space");
    await expect(canvas).toHaveAttribute("data-pan", "true");
    await size.click();
    await size.fill("90");
    await size.press("Enter");
    await page.keyboard.up("Space");
    const panel = await box(menu);
    await page.mouse.click(panel.x + panel.width / 2, panel.y + 6);
    await expect(menu).toBeVisible();
    await expect(zoom).toHaveText(fit);
    expect(await page.evaluate(() => window.openlight.getState())).toEqual(
      state,
    );
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(canvas).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Size", exact: true }),
    ).toHaveValue("90");
  });

  test(`${name} wheel sizes the brush while pinch zoom and Space-drag navigate`, async ({
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
    for (let i = 0; i < presses; i++) await page.keyboard.press(shortcut);
    const canvas = page.getByLabel(label, { exact: true });
    await expect(canvas).toBeVisible();
    const size = page.getByRole("textbox", { name: "Size", exact: true });
    const feather = page.getByRole("textbox", {
      name: "Feather",
      exact: true,
    });
    await size.fill("50");
    await size.press("Enter");
    await feather.fill("30");
    await feather.press("Enter");
    const state = await page.evaluate(() => window.openlight.getState());
    const zoom = page.getByRole("button", { name: /^\d+%$/ });
    const fit = await zoom.innerText();
    await canvas.hover();
    await page.mouse.wheel(0, -100);
    await expect(size).toHaveValue("64");
    await page.mouse.wheel(0, 100);
    await expect(size).toHaveValue("50");
    // Several wheel events before a React render must accumulate, not overwrite each other.
    await canvas.evaluate((element) => {
      for (let i = 0; i < 2; i++) {
        element.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -100,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    });
    await expect(size).toHaveValue("82");
    await expect(feather).toHaveValue("30");
    await expect(zoom).toHaveText(fit);
    await size.fill("1");
    await size.press("Enter");
    await canvas.hover();
    await page.mouse.wheel(0, -100);
    await expect(size).toHaveValue("2");
    await page.mouse.wheel(0, 100_000);
    await expect(size).toHaveValue("1");
    await page.mouse.wheel(0, -100_000);
    await expect(size).toHaveValue("600");
    // Chromium represents a trackpad pinch as ctrl+wheel.
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -80);
    await page.keyboard.up("Control");
    await expect(zoom).not.toHaveText(fit);
    await expect(size).toHaveValue("600");
    await page.mouse.wheel(60, 0);
    await expect(size).toHaveValue("600");
    await zoom.click();
    await expect(zoom).toHaveText(fit);
    const bounds = await box(canvas);
    const scale = Math.min(
      (bounds.width - 48) / 1200,
      (bounds.height - 48) / 800,
      2,
    );
    const sample = {
      x: bounds.x + bounds.width / 2 + (430 - 600) * scale,
      y: bounds.y + bounds.height / 2 + (150 - 400) * scale,
    };
    await expect
      .poll(() => readPixel(page, sample))
      .toEqual([48, 80, 128, 255]);
    await canvas.hover();
    await page.keyboard.down("Space");
    await expect(canvas).toHaveAttribute("data-pan", "true");
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 100,
      bounds.y + bounds.height / 2,
    );
    await page.keyboard.up("Space");
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 101,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.up();
    await expect
      .poll(() => readPixel(page, { ...sample, x: sample.x + 101 }))
      .toEqual([48, 80, 128, 255]);
    expect(await page.evaluate(() => window.openlight.getState())).toEqual(
      state,
    );
  });
}
