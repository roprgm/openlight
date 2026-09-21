import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box, choose, drag } from "./pointer";

test("a color layer paints the image or a brush stroke with Photoshop blends", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = () => page.evaluate(() => window.openlight.getState());
  async function addColor() {
    await page.getByRole("button", { name: "Add effect", exact: true }).click();
    await page
      .locator("[popover]:popover-open")
      .getByRole("button", { name: "Color", exact: true })
      .click();
  }
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
  await test.step("Normal paints the color; Multiply darkens by it", async () => {
    await addColor();
    const blend = page.getByRole("combobox", { name: "Blend" });
    await expect(blend).toContainText("Normal");
    const painted = (await readImage(page)).center;
    for (const [channel, expected] of [240, 118, 60].entries()) {
      expect(Math.abs(painted[channel] - expected)).toBeLessThanOrEqual(2);
    }
    await choose(page, blend, "Multiply");
    const multiplied = (await readImage(page)).center;
    expect(multiplied[0]).toBeLessThan(128);
    expect(multiplied[0]).toBeGreaterThan(multiplied[2] + 40);
    await page.evaluate(() => window.openlight.setFill({ color: "#ffffff" }));
    expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    expect((await readImage(page)).center).toEqual(painted);
    await page.keyboard.press("ControlOrMeta+z");
    expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
    expect((await state()).scene?.layers).toHaveLength(1);
  });
  await test.step("inside a brush mask the color follows the stroke", async () => {
    await page.getByRole("tab", { name: "Brush", exact: true }).click();
    const canvas = page.getByLabel("Brush canvas", { exact: true });
    const bounds = await box(canvas);
    const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
    const center = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
    await page.getByRole("textbox", { name: "Size", exact: true }).fill("200");
    await page
      .getByRole("textbox", { name: "Size", exact: true })
      .press("Enter");
    await drag(
      page,
      [center[0] - 150 * scale, center[1]],
      [center[0] + 150 * scale, center[1]],
      16,
    );
    await addColor();
    const { samples } = await readImage(page, undefined, [
      [600, 400],
      [600, 100],
    ]);
    expect(samples?.[0][0]).toBeGreaterThan(200);
    expect(samples?.[0][2]).toBeLessThan(100);
    expect(samples?.[1]).toEqual([128, 128, 128, 255]);
    await page.screenshot({ path: info.outputPath("fill-ui.png") });
  });
});
