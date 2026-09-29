import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box } from "./pointer";

test("edit on a phone and carry the canvas across the breakpoint", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  const canvas = page.getByRole("region", { name: "Image canvas" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPhoto(page);

  await test.step("the canvas stays mounted while the layout switches", async () => {
    await canvas.locator("canvas").evaluate((element) => {
      element.dataset.mounted = "";
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("tab", { name: "Layers" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Layers", exact: true }),
    ).toHaveCount(0);
    await expect(canvas.locator("canvas[data-mounted]")).toHaveCount(1);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(
      page.getByRole("region", { name: "Layers", exact: true }),
    ).toBeVisible();
    await expect(canvas.locator("canvas[data-mounted]")).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  await test.step("a tapped dial takes a typed value", async () => {
    await page.getByRole("slider", { name: "Exposure", exact: true }).click();
    const field = page.getByRole("textbox", { name: "Exposure", exact: true });
    await field.click();
    await field.fill("0.5");
    await field.press("Enter");
    expect((await state()).adjustments.exposure).toBe(0.5);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(field).toHaveCount(0);
  });

  await test.step("the stack is a tab, and an effect's dials follow the selection", async () => {
    await page.getByRole("tab", { name: "Layers" }).click();
    await page.getByRole("button", { name: "Add effect", exact: true }).click();
    await page.getByRole("menuitem", { name: "Details", exact: true }).click();
    await page.getByRole("tab", { name: "Adjust" }).click();
    await expect(
      page.getByRole("slider", { name: "Clarity", exact: true }),
    ).toBeVisible();
  });

  await test.step("a crop is chosen and applied from the dock", async () => {
    await page.getByRole("tab", { name: "Crop" }).click();
    // On a 3:2 photo, Original and 3:2 match, but only the one chosen shows.
    const chosen = page
      .getByRole("group", { name: "Aspect ratio" })
      .locator('[aria-pressed="true"]');
    await expect(chosen).toHaveText(["Original"]);
    await page.getByRole("button", { name: "Square", exact: true }).click();
    await expect(chosen).toHaveText(["Square"]);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    const [width, height] = (await state()).frame?.size ?? [];
    expect(width).toBe(height);
    await expect(
      page.getByRole("slider", { name: "Clarity", exact: true }),
    ).toBeVisible();
  });

  await test.step("tool options move from the canvas bar to the dock", async () => {
    await page.getByRole("tab", { name: "Brush" }).click();
    await expect(
      page.getByRole("slider", { name: "Size", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Image canvas" }).getByRole("group", {
        name: "Brush mode",
      }),
    ).toHaveCount(0);
  });
});

test.describe("on a touch phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  test("dials take a finger's drag as one edit, and a double tap resets", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page
      .locator('input[type="file"]')
      .setInputFiles("tests/fixtures/photo.svg");
    const exposure = page.getByRole("slider", {
      name: "Exposure",
      exact: true,
    });
    await expect(exposure).toHaveAttribute("aria-valuetext", "0.00");
    // Every dial takes a fingertip.
    for (const dial of await page.getByRole("slider").all()) {
      const bounds = await box(dial);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    const bounds = await box(exposure);
    const [x, y] = [bounds.x + bounds.width / 2, bounds.y + 20];
    const touch = await context.newCDPSession(page);
    const send = (type: "touchStart" | "touchMove" | "touchEnd", at = [x]) =>
      touch.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : at.map((x) => ({ x, y })),
      });
    await send("touchStart");
    for (let step = 1; step <= 6; step++) {
      await send("touchMove", [x + step * 10]);
    }
    await send("touchEnd");
    // Sixty pixels sweep a tenth of the range.
    await expect(exposure).toHaveAttribute("aria-valuetext", "1.00");
    expect((await readImage(page)).center).not.toEqual([128, 128, 128, 255]);
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    await expect(exposure).toHaveAttribute("aria-valuetext", "0.00");
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await undo.tap();
    await expect(exposure).toHaveAttribute("aria-valuetext", "1.00");
    await undo.tap();
    await expect(exposure).toHaveAttribute("aria-valuetext", "0.00");
    expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
  });
});
