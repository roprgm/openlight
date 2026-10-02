import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box, choose, drag, zoom } from "./pointer";

test("crop, rotate, flip and straighten the photo, then undo", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  await openPhoto(page);
  const initial = await state();
  const open = page.getByRole("tab", { name: "Crop" });
  const panel = page.getByRole("region", { name: "Crop tool" });
  const selection = page.getByRole("application", { name: "Crop selection" });
  const apply = page.getByRole("button", { name: "Apply crop" });
  const reset = panel.getByRole("button", { name: "Reset", exact: true });
  const aspect = panel.getByRole("combobox", { name: "Aspect ratio" });

  await test.step("Escape discards a draft", async () => {
    await open.click();
    await choose(page, aspect, "Square");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    expect(await state()).toEqual(initial);
  });

  await test.step("a square crop resized by its edge and moved applies as one edit", async () => {
    await page.keyboard.press("c");
    await choose(page, aspect, "Square");
    const edge = await box(
      page.getByRole("button", { name: "Resize crop right", exact: true }),
    );
    const x = edge.x + edge.width / 2;
    const y = edge.y + edge.height / 2;
    await drag(page, [x, y], [x - 60, y]);
    const bounds = await box(selection);
    await drag(
      page,
      [bounds.x + bounds.width / 2, y],
      [bounds.x + bounds.width / 2 + 300, y],
    );
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    const cropped = await readImage(page);
    expect(cropped.size[0]).toBe(cropped.size[1]);
    expect(cropped.size[0]).toBeLessThan(800);
    expect(cropped.corner).toEqual([0, 0, 0, 255]);
    expect((await state()).history.undoCount).toBe(1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await readImage(page)).size).toEqual([1200, 800]);
  });

  await test.step("a quarter turn swaps the size and a flip mirrors it", async () => {
    await open.click();
    await panel
      .getByRole("button", { name: "Rotate counterclockwise" })
      .click();
    await panel.getByRole("button", { name: "Flip vertical" }).click();
    await apply.click();
    expect(await readImage(page)).toEqual({
      size: [800, 1200],
      center: [128, 128, 128, 255],
      corner: [0, 0, 0, 255],
    });
  });

  await test.step("a drag outside the crop straightens it, and reset restores the photo", async () => {
    await open.click();
    await reset.click();
    await page.getByRole("button", { name: "Move crop" }).hover();
    await zoom(page, 0.5);
    const bounds = await box(selection);
    const x = bounds.x + bounds.width + 40;
    const y = bounds.y + bounds.height / 2;
    const rise = (bounds.width / 2 + 40) * Math.tan(Math.PI / 6);
    await drag(page, [x, y], [x, y + rise]);
    await apply.click();
    expect((await state()).frame?.angle).toBeCloseTo(30, 0);
    expect(await readImage(page)).toEqual({
      size: [1200, 800],
      center: [128, 128, 128, 255],
      corner: [32, 32, 32, 255],
    });
    await open.click();
    await reset.click();
    await apply.click();
    expect((await state()).frame).toEqual(initial.frame);
  });
});
