import { expect, test } from "./fixtures";
import { box, drag } from "./pointer";

test("edit on a phone and carry the canvas across the breakpoint", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  const canvas = page.getByRole("region", { name: "Image canvas" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");

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

  await test.step("a drag on a dial is one edit", async () => {
    const contrast = page.getByRole("slider", {
      name: "Contrast",
      exact: true,
    });
    await expect(contrast).toBeVisible();
    const bounds = await box(contrast);
    const y = bounds.y + 20;
    await drag(
      page,
      [bounds.x + bounds.width / 2, y],
      [bounds.x + bounds.width / 2 + 60, y],
    );
    expect((await state()).adjustments.contrast).toBe(20);
    await page.getByRole("button", { name: "Undo" }).click();
    expect((await state()).adjustments.contrast).toBe(0);
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
    await page.getByRole("button", { name: "Square", exact: true }).click();
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
