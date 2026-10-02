import { expect, openPhoto, test } from "./fixtures";
import { readImage, readPreview } from "./images";
import { box, choose, drag } from "./pointer";

test("draw masks, edit their child effects, reorder layers and undo", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = () => page.evaluate(() => window.openlight.getState());
  const layers = async () => (await state()).scene?.layers ?? [];
  const undo = () =>
    page.getByRole("button", { name: "Undo", exact: true }).click();
  async function samples() {
    const points = [
      [600, 100],
      [600, 700],
    ] as const;
    return (await readImage(page, undefined, points)).samples ?? [];
  }
  async function radialMask() {
    const layer = (await layers()).at(-1);
    if (layer?.kind !== "mask" || layer.mask.kind !== "radial") {
      throw Error("Radial mask missing");
    }
    return layer.mask;
  }
  async function setField(name: string, value: string) {
    const field = page.getByRole("textbox", { name, exact: true });
    await field.fill(value);
    await field.press("Enter");
  }
  async function action(layer: string, ...items: string[]) {
    await page
      .getByRole("button", { name: `${layer} actions`, exact: true })
      .click();
    for (const item of items) {
      await page.getByRole("menuitem", { name: item, exact: true }).click();
    }
  }
  await openPhoto(page);
  const original = await samples();
  await test.step("a local exposure recovers light the global exposure pushed past white", async () => {
    // The gray field and the light band, both inside the radial mask.
    const points = [
      [600, 700],
      [1100, 700],
    ] as const;
    const tones = async () =>
      (await readImage(page, undefined, points)).samples?.map(([red]) => red);
    expect(await tones()).toEqual([128, 224]);
    await page.evaluate(() => {
      const api = window.openlight;
      api.setAdjustments({ exposure: 2 });
      const mask = api.addLayer("mask");
      api.setLayerMask(mask, {
        kind: "radial",
        center: [850, 700],
        radius: [400, 200],
        angle: 0,
        feather: 0,
      });
      api.setAdjustments({ exposure: -2 }, mask);
    });
    const [gray, band] = (await tones()) ?? [];
    expect(Math.abs(gray - 128)).toBeLessThan(30);
    expect(Math.abs(band - 224)).toBeLessThan(30);
    expect(band - gray).toBeGreaterThan(0.6 * (224 - 128));
    expect((await samples())[0][0]).toBeGreaterThan(200);
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) window.openlight.undo();
    });
    expect(await samples()).toEqual(original);
  });
  await page.keyboard.press("l");
  const bounds = await box(
    page.getByLabel("Gradient mask canvas", { exact: true }),
  );
  const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
  const center = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  const from = [center[0], center[1] - 200 * scale];
  const to = [center[0], center[1] + 200 * scale];
  await test.step("a linear mask shows its overlay until an adjustment changes the image", async () => {
    // Sample above the center, clear of the guide lines and the move handle.
    const tinted = async () => {
      const { center } = await readPreview(page, [0, -100 * scale]);
      return center[0] > center[1] + 30;
    };
    await drag(page, from, to);
    expect(await layers()).toMatchObject([{}, { mask: { kind: "linear" } }]);
    await expect.poll(tinted).toBe(true);
    await setField("Exposure", "1");
    await expect.poll(tinted).toBe(false);
    await page.keyboard.press("o");
    await expect.poll(tinted).toBe(true);
    await page.keyboard.press("o");
    const [top, bottom] = await samples();
    expect(top[0]).toBeGreaterThan(170);
    expect(bottom).toEqual(original[1]);
  });
  await test.step("the move guide is one undo step, Escape cancels it, and Delete removes the mask", async () => {
    const before = await state();
    const pixels = await samples();
    await drag(page, center, [center[0], center[1] - 150 * scale]);
    expect(await samples()).not.toEqual(pixels);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await samples()).toEqual(pixels);
    await page.mouse.move(center[0], center[1]);
    await page.mouse.down();
    await page.mouse.move(center[0] + 50, center[1] + 50);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect((await state()).scene).toEqual(before.scene);
    await page.keyboard.press("Delete");
    expect(await layers()).toHaveLength(1);
    await page.keyboard.press("ControlOrMeta+z");
    expect((await state()).scene).toEqual(before.scene);
  });
  await test.step("a subtracting child changes coverage and Add restores it", async () => {
    await page
      .getByRole("button", { name: "Linear Gradient", exact: true })
      .dblclick();
    await setField("Layer name", "Sky");
    const masked = await samples();
    await action("Sky", "Subtract from mask", "Linear gradient");
    await drag(page, from, to);
    expect((await samples())[0]).toEqual(original[0]);
    const operation = page.getByRole("combobox", { name: "Mask operation" });
    await choose(page, operation, "Add");
    expect((await samples())[0]).toEqual(masked[0]);
    await undo();
    await undo();
    expect(await samples()).toEqual(masked);
    await page.getByRole("button", { name: "Sky", exact: true }).click();
  });
  await test.step("a child effect moves out by drag and menu, returns, duplicates and deletes", async () => {
    const masked = await samples();
    await page.getByRole("button", { name: "Add effect", exact: true }).click();
    await page.getByRole("menuitem", { name: "Vignette", exact: true }).click();
    await setField("Intensity", "80");
    const nested = await samples();
    expect(nested[0][0]).toBeLessThan(masked[0][0]);
    expect(nested[1]).toEqual(masked[1]);
    const row = (name: string) =>
      box(
        page
          .getByRole("region", { name: "Layers", exact: true })
          .getByRole("button", { name, exact: true }),
      );
    const vignette = await row("Vignette");
    const sky = await row("Sky");
    await drag(
      page,
      [vignette.x + vignette.width / 2, vignette.y + vignette.height / 2],
      [sky.x + sky.width / 2, sky.y + 2],
    );
    expect(await layers()).toHaveLength(3);
    expect((await samples())[1][0]).toBeLessThan(masked[1][0]);
    await undo();
    expect(await samples()).toEqual(nested);
    await action("Vignette", "Move out");
    expect((await samples())[1][0]).toBeLessThan(masked[1][0]);
    await action("Vignette", "Move into", "Sky");
    expect(await samples()).toEqual(nested);
    await action("Vignette", "Duplicate");
    expect((await samples())[0][0]).toBeLessThan(nested[0][0]);
    await undo();
    await action("Vignette", "Delete");
    expect(await samples()).toEqual(masked);
    await undo();
    expect(await samples()).toEqual(nested);
  });
  await test.step("mask opacity and visibility apply to the whole branch", async () => {
    await page.getByRole("button", { name: "Sky", exact: true }).click();
    const masked = await samples();
    await setField("Opacity", "0");
    expect(await samples()).toEqual(original);
    await undo();
    const show = page.getByRole("button", { name: "Show Sky", exact: true });
    await show.click();
    expect(await samples()).toEqual(original);
    await show.click();
    expect(await samples()).toEqual(masked);
  });
  await test.step("a radial mask moves, resizes, rotates and feathers with its guides", async () => {
    await page.getByRole("button", { name: "photo.svg", exact: true }).click();
    const before = await readImage(page);
    await page.keyboard.press("r");
    await drag(page, center, [
      center[0] + 220 * scale,
      center[1] + 120 * scale,
    ]);
    await setField("Exposure", "1");
    expect((await readImage(page)).center[0]).toBeGreaterThan(
      before.center[0] + 20,
    );
    await drag(
      page,
      [center[0] + 40, center[1] + 30],
      [center[0] + 40 + 300 * scale, center[1] + 30],
    );
    expect((await readImage(page)).center).toEqual(before.center);
    await page.keyboard.press("ControlOrMeta+z");
    const radius = await box(page.getByLabel("Radial right radius"));
    const [x, y] = [radius.x + radius.width / 2, radius.y + radius.height / 2];
    await drag(page, [x, y], [x - 120 * scale, y]);
    const rotation = await box(page.getByLabel("Rotate radial gradient"));
    await drag(
      page,
      [rotation.x + rotation.width / 2, rotation.y + rotation.height / 2],
      [center[0] + 150 * scale, center[1]],
    );
    await setField("Feather", "80");
    const radial = await radialMask();
    expect(radial).toMatchObject({
      angle: expect.closeTo(90, 0),
      feather: 0.8,
    });
    expect(radial.radius[0]).toBeLessThan(radial.radius[1]);
  });
  await test.step("Shift draws a circle, and a guide's double click keeps the zoom", async () => {
    await page.getByRole("button", { name: "photo.svg", exact: true }).click();
    await page.keyboard.press("r");
    await page.mouse.move(center[0], center[1]);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.mouse.move(center[0] + 65, center[1] + 35);
    await page.keyboard.up("Shift");
    await page.mouse.up();
    const { radius } = await radialMask();
    expect(radius[0]).toBe(radius[1]);
    const zoom = page.getByRole("button", { name: /^\d+%$/ });
    const fitted = await zoom.innerText();
    // At fit the percentage zooms to one image pixel per device pixel, then fits again.
    await zoom.click();
    await page.getByLabel("Move gradient", { exact: true }).dblclick();
    await expect(zoom).toHaveText("100%");
    await zoom.click();
    await expect(zoom).toHaveText(fitted);
  });
});
