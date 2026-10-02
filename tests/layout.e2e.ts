import { expect, openPhoto, test } from "./fixtures";
import { box } from "./pointer";

test("edit on a phone and carry the canvas across the breakpoint", async ({
  page,
}) => {
  const canvas = page.getByRole("region", { name: "Image canvas" });
  const layers = page.getByRole("region", { name: "Layers", exact: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPhoto(page);

  await test.step("the canvas stays mounted while the layout switches", async () => {
    await canvas.locator("canvas").evaluate((element) => {
      element.dataset.mounted = "";
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(layers).toHaveCount(0);
    await expect(canvas.locator("canvas[data-mounted]")).toHaveCount(1);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(layers).toBeVisible();
    await expect(canvas.locator("canvas[data-mounted]")).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  await test.step("tabs switch the dock between the stack, dials, and crop", async () => {
    await page.getByRole("tab", { name: "Layers" }).click();
    await page.getByRole("button", { name: "Add effect", exact: true }).click();
    await page.getByRole("menuitem", { name: "Details", exact: true }).click();
    await page.getByRole("tab", { name: "Adjust" }).click();
    await expect(
      page.getByRole("slider", { name: "Clarity", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Crop" }).click();
    await page.getByRole("button", { name: "Square", exact: true }).click();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.openlight.getState().frame?.size))
      .toEqual([800, 800]);
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
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    await expect(exposure).toHaveAttribute("aria-valuetext", "0.00");
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await undo.tap();
    await expect(exposure).toHaveAttribute("aria-valuetext", "1.00");
    await undo.tap();
    await expect(exposure).toHaveAttribute("aria-valuetext", "0.00");
  });
});
