import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box, choose } from "./pointer";

test("sample color and luminance masks, combine coverage, undo and reopen the scene", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("button", { name: "photo.svg", exact: true }),
  ).toBeVisible();
  const state = () => page.evaluate(() => window.openlight.getState());
  const samples = async () =>
    (
      await readImage(page, undefined, [
        [350, 200],
        [600, 400],
        [1100, 400],
        [100, 400],
      ])
    ).samples;
  async function field(name: string, value: string) {
    const input = page.getByRole("textbox", { name, exact: true });
    await input.fill(value);
    await input.press("Enter");
  }
  async function pick(x: number, y: number) {
    const bounds = await box(
      page.getByRole("application", { name: "Range mask canvas" }),
    );
    const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
    await page.mouse.click(
      bounds.x + bounds.width / 2 + (x - 600) * scale,
      bounds.y + bounds.height / 2 + (y - 400) * scale,
    );
  }
  const original = await samples();
  if (!original) throw Error("Missing image samples.");
  await test.step("the color sampler selects blue without selecting gray or white", async () => {
    await page.getByRole("tab", { name: "Color range", exact: true }).click();
    await pick(350, 200);
    await expect(
      page.getByRole("button", { name: "Color Range", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Sample color", { exact: true })).toHaveValue(
      "#305080",
    );
    expect((await state()).history.undoCount).toBe(1);
    await field("Tolerance", "15");
    await field("Exposure", "1");
    const edited = await samples();
    expect(edited?.[0][2]).toBeGreaterThan(original[0][2] + 25);
    expect(edited?.slice(1)).toEqual(original.slice(1));
    await page.keyboard.press("o");
    await pick(350, 200);
    await expect(page.getByLabel("Sample color", { exact: true })).toHaveValue(
      "#305080",
    );
    await page.keyboard.press("o");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect(await samples()).toEqual(original);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    expect(await samples()).toEqual(edited);
    await page.screenshot({ path: info.outputPath("color-range.png") });
  });
  await test.step("a new range samples the complete image below its new layer", async () => {
    await page
      .getByRole("tab", { name: "Luminance range", exact: true })
      .click();
    await pick(350, 200);
    await expect(
      page.getByRole("button", { name: "Luminance Range", exact: true }),
    ).toBeVisible();
    const layer = (await state()).scene?.layers.at(-1);
    expect(
      layer?.kind === "mask" &&
        layer.mask.kind === "luminance-range" &&
        layer.mask.min > 0.3,
    ).toBe(true);
  });
  await page.evaluate(() => window.openlight.run({ type: "reset" }));
  await test.step("the luminance range changes highlights while leaving dark and midtone pixels untouched", async () => {
    await page
      .getByRole("tab", { name: "Luminance range", exact: true })
      .click();
    await pick(1100, 400);
    await expect(
      page.getByRole("button", { name: "Luminance Range", exact: true }),
    ).toBeVisible();
    await field("Minimum", "70");
    await field("Maximum", "100");
    await field("Smoothness", "0");
    await field("Exposure", "-1");
    const edited = await samples();
    expect(edited?.[2][0]).toBeLessThan(original[2][0] - 40);
    expect(edited?.[0]).toEqual(original[0]);
    expect(edited?.[1]).toEqual(original[1]);
    expect(edited?.[3]).toEqual(original[3]);
    await page.screenshot({ path: info.outputPath("luminance-range.png") });
    await page
      .getByRole("button", { name: "Luminance Range actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Subtract from mask", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Color range", exact: true })
      .click();
    await pick(1100, 400);
    await expect(
      page.getByRole("button", { name: "Color Range", exact: true }),
    ).toBeVisible();
    expect((await samples())?.[2]).toEqual(original[2]);
    await choose(
      page,
      page.getByRole("combobox", { name: "Mask operation", exact: true }),
      "Add",
    );
    expect((await samples())?.[2]).toEqual(edited?.[2]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await samples())?.[2]).toEqual(original[2]);
  });
  const before = await state();
  const pixels = await samples();
  await test.step("range masks survive saving and reopening with identical exported pixels", async () => {
    await page.evaluate(async () => {
      const file = await window.openlight.exportScene();
      await window.openlight.loadScene(file);
    });
    expect((await state()).scene).toEqual(before.scene);
    expect((await state()).history.undoCount).toBe(0);
    expect(await samples()).toEqual(pixels);
  });
  await test.step("the range controls work in the mobile dock", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Layers", exact: true }).click();
    await page
      .getByRole("button", { name: "Color Range", exact: true })
      .click();
    await page.getByRole("tab", { name: "Color range", exact: true }).click();
    await expect(
      page.getByLabel("Sample color", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("slider", { name: "Tolerance", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath("range-mobile.png") });
  });
});
