import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box, choose, drag } from "./pointer";

const gray = [128, 128, 128, 255];

/** Export pixels inside the strokes and far above them. */
async function samples(page: Page) {
  const { samples } = await readImage(page, undefined, [
    [600, 400],
    [600, 100],
  ]);
  return samples ?? [];
}

test("paint colors on a layer, swap them, erase, blend, and switch to a mask", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const kinds = async () =>
    (await page.evaluate(() => window.openlight.getState())).scene?.layers.map(
      (layer) => layer.kind,
    );
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  await page.getByRole("tab", { name: "Brush", exact: true }).click();
  const options = page.getByRole("group", { name: "Layer options" });
  const color = options.getByRole("button", { name: "Color", exact: true });
  const mask = options.getByRole("button", { name: "Mask", exact: true });
  await expect(mask).toHaveAttribute("aria-pressed", "true");
  await color.click();
  const canvas = page.getByLabel("Paint canvas", { exact: true });
  await expect(canvas).toBeVisible();
  // The untouched brush mask gives way to a paint layer.
  expect(await kinds()).toEqual(["image", "paint"]);
  const size = options.getByRole("textbox", { name: "Size", exact: true });
  await size.fill("200");
  await size.press("Enter");
  const bounds = await box(canvas);
  const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
  const center = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  const from = [center[0] - 150 * scale, center[1]];
  const to = [center[0] + 150 * scale, center[1]];
  await test.step("a stroke paints the primary color", async () => {
    await page.getByLabel("Primary color").fill("#ff0000");
    await drag(page, from, to, 16);
    expect(await samples(page)).toEqual([[255, 0, 0, 255], gray]);
  });
  await test.step("X swaps in the secondary color, white", async () => {
    await page.keyboard.press("x");
    await drag(page, from, to, 16);
    expect(await samples(page)).toEqual([[255, 255, 255, 255], gray]);
  });
  await test.step("Multiply by white leaves the image as it was", async () => {
    await choose(
      page,
      page.getByRole("combobox", { name: "Blend" }),
      "Multiply",
    );
    expect(await samples(page)).toEqual([gray, gray]);
    await page.keyboard.press("ControlOrMeta+z");
  });
  await test.step("Alt erases the paint, and undo brings it back", async () => {
    await page.keyboard.down("Alt");
    await drag(page, from, to, 16);
    await page.keyboard.up("Alt");
    expect(await samples(page)).toEqual([gray, gray]);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await samples(page)).toEqual([[255, 255, 255, 255], gray]);
  });
  await test.step("the mode follows the selected layer", async () => {
    await mask.click();
    await expect(
      page.getByLabel("Brush canvas", { exact: true }),
    ).toBeVisible();
    expect(await kinds()).toEqual(["image", "paint", "mask"]);
    // Choosing the paint layer leaves the tool, and the untouched mask with it; B paints on the layer again.
    await page
      .getByRole("button", { name: "Select Paint", exact: true })
      .click();
    expect(await kinds()).toEqual(["image", "paint"]);
    await page.keyboard.press("b");
    await expect(color).toHaveAttribute("aria-pressed", "true");
    await expect(canvas).toBeVisible();
    expect(await kinds()).toEqual(["image", "paint"]);
  });
});

test("strokes settle into pixels, undo takes them back, and scenes keep them", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  const layer = () =>
    page.evaluate(() => {
      const [, paint] = window.openlight.getState().scene?.layers ?? [];
      return paint?.kind === "paint"
        ? { raster: paint.raster, strokes: paint.strokes.length }
        : undefined;
    });
  // Short strokes down the image, red then blue, the last across the center.
  const paint = (from: number, to: number) =>
    page.evaluate(
      ([from, to]) => {
        const [, layer] = window.openlight.getState().scene?.layers ?? [];
        const id = layer?.id ?? window.openlight.addLayer("paint");
        for (let i = from; i < to; i++) {
          const x = i === 99 ? 580 : 100 + (i % 10) * 100;
          const y = i === 99 ? 400 : 80 + Math.floor(i / 10) * 60;
          window.openlight.addPaintStroke(id, {
            mode: "paint",
            size: 30,
            feather: 0.5,
            flow: 1,
            color: i === 99 ? "#0000ff" : "#ff0000",
            points: [
              [x, y, 1],
              [x + 40, y, 1],
            ],
          });
        }
      },
      [from, to] as const,
    );
  await paint(0, 99);
  expect(await layer()).toEqual({ raster: undefined, strokes: 99 });
  const before = await samples(page);
  expect(before[0]).toEqual(gray);

  await test.step("the hundredth stroke settles every stroke into pixels", async () => {
    await paint(99, 100);
    await expect.poll(layer).toMatchObject({ strokes: 0 });
    expect((await layer())?.raster).toEqual(expect.any(String));
    const settled = await samples(page);
    expect(settled[0][2]).toBeGreaterThan(200);
    expect(settled[1]).toEqual(before[1]);
  });

  await test.step("undo goes back to the strokes, and redo to the pixels", async () => {
    const settled = await samples(page);
    await page.evaluate(() => window.openlight.undo());
    expect(await layer()).toEqual({ raster: undefined, strokes: 99 });
    expect(await samples(page)).toEqual(before);
    await page.evaluate(() => window.openlight.redo());
    expect(await samples(page)).toEqual(settled);
  });

  await test.step("a stroke over the pixels undoes by loading them again", async () => {
    const settled = await samples(page);
    await paint(100, 101);
    expect((await layer())?.strokes).toBe(1);
    await page.evaluate(() => window.openlight.undo());
    expect(await samples(page)).toEqual(settled);
  });

  await test.step("a scene file keeps the pixels", async () => {
    const settled = await samples(page);
    const raster = (await layer())?.raster;
    await page.evaluate(async () => {
      const scene = await window.openlight.exportScene();
      await window.openlight.openFile(scene);
    });
    await expect.poll(layer).toEqual({ raster, strokes: 0 });
    expect(await samples(page)).toEqual(settled);
  });
});

test("Photoshop's keys switch the brush, its colors, feather, flow, and opacity, and a right click sizes it", async ({
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
  const options = page.getByRole("group", { name: "Layer options" });
  const field = (name: string) =>
    options.getByRole("textbox", { name, exact: true });
  const chip = (name: string) =>
    options.getByRole("button", { name, exact: true });
  await page.keyboard.press("b");
  await expect(chip("Mask")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("b");
  await expect(chip("Color")).toHaveAttribute("aria-pressed", "true");

  const primary = page.getByLabel("Primary color");
  const secondary = page.getByLabel("Secondary color");
  await primary.fill("#ff0000");
  await page.keyboard.press("x");
  await expect(primary).toHaveValue("#ffffff");
  await expect(secondary).toHaveValue("#ff0000");
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

  await page
    .getByLabel("Brush canvas", { exact: true })
    .click({ button: "right", position: { x: 300, y: 300 } });
  const size = page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Size", exact: true });
  await size.fill("120");
  await size.press("Enter");
  await expect(field("Size")).toHaveValue("120");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
