import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box, choose, drag } from "./pointer";

test("a color layer paints a brush stroke with Photoshop blends", async ({
  page,
}) => {
  await openPhoto(page);
  await page.getByRole("tab", { name: "Brush", exact: true }).click();
  const bounds = await box(page.getByLabel("Brush canvas", { exact: true }));
  const y = bounds.y + bounds.height / 2;
  const x = bounds.x + bounds.width / 2;
  await drag(page, [x - 100, y], [x + 100, y], 16);
  await page.getByRole("button", { name: "Add effect", exact: true }).click();
  await page.getByRole("menuitem", { name: "Color", exact: true }).click();
  const read = async () =>
    (
      await readImage(page, undefined, [
        [600, 400],
        [600, 100],
      ])
    ).samples ?? [];
  const [painted, outside] = await read();
  for (const [channel, expected] of [240, 118, 60].entries()) {
    expect(Math.abs(painted[channel] - expected)).toBeLessThanOrEqual(2);
  }
  expect(outside).toEqual([128, 128, 128, 255]);
  await choose(page, page.getByRole("combobox", { name: "Blend" }), "Multiply");
  const [multiplied] = await read();
  expect(multiplied[0]).toBeLessThan(128);
  expect(multiplied[0]).toBeGreaterThan(multiplied[2] + 40);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await read())[0]).toEqual(painted);
});
