import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage, readPreview } from "./images";
import { box, drag } from "./pointer";

/** Export pixels inside the stroke and far above it. */
async function samples(page: Page) {
  const { samples } = await readImage(page, undefined, [
    [600, 400],
    [600, 100],
  ]);
  return samples ?? [];
}

test("paint a brush mask, adjust it in the sidebar, erase, and undo", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = () => page.evaluate(() => window.openlight.getState());
  async function setField(name: string, value: string) {
    const field = page.getByRole("textbox", { name, exact: true });
    await field.fill(value);
    await field.press("Enter");
  }
  async function tinted() {
    const { center } = await readPreview(page);
    return center[0] > center[1] + 30;
  }
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  const original = await samples(page);
  await page.getByRole("tab", { name: "Brush", exact: true }).click();
  const canvas = page.getByLabel("Brush canvas", { exact: true });
  await expect(canvas).toBeVisible();
  // Choosing the tool creates its mask at once, so the sidebar already edits it.
  expect((await state()).scene?.layers).toHaveLength(2);
  // Tool options sit over the canvas; the sidebar keeps the selected layer's adjustments.
  const options = page.getByRole("group", { name: "Layer options" });
  const overlayButton = options.getByRole("button", {
    name: "Overlay",
    exact: true,
  });
  await expect(
    options.getByRole("textbox", { name: "Size", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Adjustments", exact: true }),
  ).toBeVisible();
  const bounds = await box(canvas);
  const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
  const center = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  const from = [center[0] - 150 * scale, center[1]];
  const to = [center[0] + 150 * scale, center[1]];
  const brushCursor = canvas.locator('[data-brush-cursor="true"]');
  const sizeField = options.getByRole("textbox", {
    name: "Size",
    exact: true,
  });
  await sizeField.focus();
  await expect(brushCursor).toHaveAttribute("data-preview", "true");
  await sizeField.fill("200");
  await sizeField.press("Enter");
  await expect(brushCursor).toHaveCount(0);
  const featherField = options.getByRole("textbox", {
    name: "Feather",
    exact: true,
  });
  await featherField.focus();
  await expect(brushCursor).toHaveAttribute("data-preview", "true");
  await featherField.press("Enter");
  await expect(brushCursor).toHaveCount(0);
  await test.step("a drag paints the new brush mask, which shows its overlay", async () => {
    await drag(page, from, to, 16);
    const layers = (await state()).scene?.layers;
    expect(layers).toHaveLength(2);
    const mask = layers?.[1];
    expect(mask).toMatchObject({ kind: "mask", name: "Brush" });
    if (mask?.kind === "mask" && mask.mask.kind === "brush") {
      expect(mask.mask.strokes).toHaveLength(1);
      expect(mask.mask.strokes[0].size).toBe(200);
      expect(mask.mask.strokes[0].points.length).toBeGreaterThan(2);
    }
    expect((await state()).selectedLayerId).toBe(mask?.id);
    expect(await samples(page)).toEqual(original);
    await page.mouse.move(bounds.x + 20, bounds.y + 20);
    await expect.poll(tinted).toBe(true);
    await expect(overlayButton).toHaveAttribute("aria-pressed", "true");
    // The row's thumbnail shows the stroke through the middle once it is committed.
    const thumbnail = page
      .getByRole("region", { name: "Layers", exact: true })
      .getByLabel("Mask thumbnail", { exact: true });
    await expect
      .poll(() =>
        thumbnail.evaluate((element) => {
          const context = (element as HTMLCanvasElement).getContext("2d");
          const inside = context?.getImageData(32, 32, 1, 1).data[0] ?? 0;
          const corner = context?.getImageData(4, 4, 1, 1).data[0] ?? 0;
          return { lit: inside > 200, dark: corner < 30 };
        }),
      )
      .toEqual({ lit: true, dark: true });
  });
  await test.step("Enter leaves one level at a time; selecting the mask returns", async () => {
    const selected = (await state()).selectedLayerId;
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("tab", { name: "Adjust", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(canvas).toHaveCount(0);
    expect((await state()).selectedLayerId).toBe(selected);
    await expect.poll(tinted).toBe(false);
    await expect(overlayButton).toHaveAttribute("aria-pressed", "false");
    // The next Enter selects the image and its global controls.
    await page.keyboard.press("Enter");
    const state2 = await state();
    expect(state2.selectedLayerId).toBe(state2.scene?.layers[0].id);
    await expect(overlayButton).toHaveCount(0);
    await page
      .getByRole("button", { name: "Select Brush", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Brush", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(canvas).toBeVisible();
    await page.mouse.move(bounds.x + 20, bounds.y + 20);
    await expect.poll(tinted).toBe(true);
  });
  await test.step("an adjustment replaces the overlay with its own effect", async () => {
    await setField("Exposure", "2");
    const [inside, above] = await samples(page);
    expect(inside[0]).toBeGreaterThan(original[0][0] + 40);
    expect(above).toEqual(original[1]);
    await expect.poll(tinted).toBe(false);
    await page.keyboard.press("o");
    await expect.poll(tinted).toBe(true);
    await expect(overlayButton).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("o");
    await expect.poll(tinted).toBe(false);
    await page.screenshot({ path: info.outputPath("brush-ui.png") });
  });
  await test.step("Alt erases and each stroke is one undo step", async () => {
    const painted = await samples(page);
    const before = (await state()).history.undoCount;
    await page.keyboard.down("Alt");
    await drag(page, from, to, 16);
    await page.keyboard.up("Alt");
    expect((await state()).history.undoCount).toBe(before + 1);
    expect((await samples(page))[0]).toEqual(original[0]);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await samples(page)).toEqual(painted);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await samples(page)).toEqual(original);
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    expect((await state()).scene?.layers).toHaveLength(1);
  });
  await test.step("an untouched new brush mask leaves no trace; an adjusted one stays", async () => {
    const before = (await state()).history.undoCount;
    await page.keyboard.press("b");
    await expect(canvas).toBeVisible();
    expect((await state()).scene?.layers[1]).toMatchObject({
      kind: "mask",
      name: "Brush",
      mask: { kind: "brush", strokes: [] },
    });
    // Escape cancels the stroke and keeps the empty mask; Escape again leaves the tool.
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect((await state()).scene?.layers).toHaveLength(2);
    await page.keyboard.press("Escape");
    await expect(canvas).toHaveCount(0);
    expect((await state()).scene?.layers).toHaveLength(1);
    expect((await state()).history).toMatchObject({
      undoCount: before,
      redoCount: 0,
    });
    // An adjustment before the first stroke belongs to the new mask and keeps it.
    await page.keyboard.press("b");
    await setField("Exposure", "1");
    expect(await samples(page)).toEqual(original);
    await drag(page, from, to, 16);
    expect((await samples(page))[0][0]).toBeGreaterThan(original[0][0] + 20);
    await page.keyboard.press("Enter");
    expect((await state()).scene?.layers).toHaveLength(2);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("ControlOrMeta+z");
    }
    expect((await state()).scene?.layers).toHaveLength(1);
  });
  await test.step("Subtract adds a brush inside the selected gradient", async () => {
    await page.keyboard.press("l");
    await drag(
      page,
      [center[0], center[1] - 200 * scale],
      [center[0], center[1] + 200 * scale],
    );
    await setField("Exposure", "1");
    const lit = await samples(page);
    expect(lit[1][0]).toBeGreaterThan(original[1][0] + 20);
    await page
      .getByRole("button", {
        name: "Subtract from Linear Gradient",
        exact: true,
      })
      .click();
    await page
      .locator("[popover]:popover-open")
      .getByRole("button", { name: "Brush", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Brush", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await drag(
      page,
      [center[0], center[1] - 300 * scale],
      [center[0], center[1] - 300 * scale + 1],
      2,
    );
    const layers = (await state()).scene?.layers;
    expect(layers?.[1].children).toHaveLength(1);
    expect(layers?.[1].children[0]).toMatchObject({
      kind: "mask",
      operation: "subtract",
      mask: { kind: "brush" },
    });
    expect((await samples(page))[1]).toEqual(original[1]);
    // The child row previews its own coverage, and erasing in it restores the gradient's.
    const thumbnails = page
      .getByRole("region", { name: "Layers", exact: true })
      .getByLabel("Mask thumbnail", { exact: true });
    await expect(thumbnails).toHaveCount(2);
    await expect
      .poll(() =>
        thumbnails.nth(1).evaluate((element) => {
          const context = (element as HTMLCanvasElement).getContext("2d");
          return context?.getImageData(32, 8, 1, 1).data[0] ?? 0;
        }),
      )
      .toBeGreaterThan(200);
    await page.keyboard.down("Alt");
    await drag(
      page,
      [center[0], center[1] - 300 * scale],
      [center[0], center[1] - 300 * scale + 1],
      2,
    );
    await page.keyboard.up("Alt");
    expect((await samples(page))[1]).toEqual(lit[1]);
  });
  await test.step("Escape climbs from the child mask to its parent and the image; Enter on a button is its click", async () => {
    const initial = await state();
    const gradient = initial.scene?.layers[1];
    const child = gradient?.children[0];
    expect(initial.selectedLayerId).toBe(child?.id);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("tab", { name: "Adjust", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect((await state()).selectedLayerId).toBe(child?.id);
    await page.keyboard.press("Escape");
    expect((await state()).selectedLayerId).toBe(gradient?.id);
    await overlayButton.click();
    await expect(overlayButton).toHaveAttribute("aria-pressed", "true");
    await overlayButton.press("Enter");
    await expect(overlayButton).toHaveAttribute("aria-pressed", "false");
    expect((await state()).selectedLayerId).toBe(gradient?.id);
    await page.keyboard.press("Escape");
    expect((await state()).selectedLayerId).toBe(initial.scene?.layers[0].id);
    await expect(overlayButton).toHaveCount(0);
    await page.keyboard.press("Escape");
    expect((await state()).selectedLayerId).toBe(initial.scene?.layers[0].id);
  });
});

test("a second finger during a touch stroke cancels it and pinches instead", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page
      .locator('input[type="file"]')
      .setInputFiles("tests/fixtures/photo.svg");
    await expect(
      page.getByRole("textbox", { name: "Exposure", exact: true }),
    ).toHaveValue("0.00");
    await page.getByRole("tab", { name: "Brush", exact: true }).click();
    const canvas = page.getByLabel("Brush canvas", { exact: true });
    await expect(canvas).toBeVisible();
    const zoom = page.locator('button[title="Fit to view"]');
    const before = await zoom.textContent();
    const bounds = await box(canvas);
    const [cx, cy] = [
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    ];
    const touch = await context.newCDPSession(page);
    const send = (
      type: "touchStart" | "touchMove" | "touchEnd",
      points: number[][],
    ) =>
      touch.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(([x, y]) => ({ x, y })),
      });
    await send("touchStart", [[cx - 40, cy]]);
    await send("touchMove", [[cx - 20, cy + 10]]);
    await send("touchStart", [
      [cx - 20, cy + 10],
      [cx + 40, cy],
    ]);
    for (let step = 1; step <= 6; step++) {
      await send("touchMove", [
        [cx - 20 - step * 8, cy + 10 + step * 4],
        [cx + 40 + step * 8, cy - step * 4],
      ]);
    }
    await send("touchEnd", []);
    await expect(zoom).not.toHaveText(before ?? "");
    const state = await page.evaluate(() => window.openlight.getState());
    const mask = state.scene?.layers[1];
    expect(
      mask?.kind === "mask" && mask.mask.kind === "brush" && mask.mask.strokes,
    ).toEqual([]);
    expect("editing" in state.history && state.history.editing).toBe(false);
  } finally {
    await context.close();
  }
});
