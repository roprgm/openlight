import { expect, openPhoto, test } from "./fixtures";
import { readImage, readPreview } from "./images";
import { box, drag } from "./pointer";

test("paint a brush mask, adjust it in the sidebar, erase, and undo", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = () => page.evaluate(() => window.openlight.getState());
  const adjustTab = page.getByRole("tab", { name: "Adjust", exact: true });
  /** Export pixels inside the stroke and far above it. */
  async function samples() {
    const points = [
      [600, 400],
      [600, 100],
    ] as const;
    return (await readImage(page, undefined, points)).samples ?? [];
  }
  async function setField(name: string, value: string) {
    const field = page.getByRole("textbox", { name, exact: true });
    await field.fill(value);
    await field.press("Enter");
  }
  async function tinted() {
    const { center } = await readPreview(page);
    return center[0] > center[1] + 30;
  }
  await openPhoto(page);
  const original = await samples();
  const { history } = await state();
  await page.getByRole("tab", { name: "Brush", exact: true }).click();
  const canvas = page.getByLabel("Brush canvas", { exact: true });
  const bounds = await box(canvas);
  const scale = Math.min(
    (bounds.width - 48) / 1200,
    (bounds.height - 48) / 800,
    2,
  );
  const center = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  const from = [center[0] - 150 * scale, center[1]];
  const to = [center[0] + 150 * scale, center[1]];
  await test.step("a cancelled stroke leaves the new mask untouched, and leaving drops it", async () => {
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.keyboard.press("Escape");
    await expect(canvas).toHaveCount(0);
    expect(await state()).toMatchObject({ scene: { layers: [{}] }, history });
  });
  await test.step("an adjustment before the first stroke belongs to the new mask", async () => {
    await page.keyboard.press("b");
    await setField("Size", "200");
    await setField("Exposure", "2");
    expect(await samples()).toEqual(original);
    await drag(page, from, to, 16);
    const current = await state();
    expect(current.scene?.layers[1]).toMatchObject({
      id: current.selectedLayerId,
      name: "Brush",
      mask: {
        kind: "brush",
        strokes: [{ size: expect.closeTo(200 / scale, 6) }],
      },
    });
    const [inside, above] = await samples();
    expect(inside[0]).toBeGreaterThan(original[0][0] + 40);
    expect(above).toEqual(original[1]);
    await page.mouse.move(bounds.x + 20, bounds.y + 20);
    await page.keyboard.press("o");
    await expect.poll(tinted).toBe(true);
    await page.keyboard.press("o");
    // The row's thumbnail shows the stroke through the middle.
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
  await test.step("Alt erases in one undo step", async () => {
    const painted = await samples();
    await page.keyboard.down("Alt");
    await drag(page, from, to, 16);
    await page.keyboard.up("Alt");
    expect((await samples())[0]).toEqual(original[0]);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await samples()).toEqual(painted);
  });
  await test.step("Enter leaves one level at a time; selecting the mask returns", async () => {
    const { selectedLayerId, scene } = await state();
    await page.keyboard.press("Enter");
    await expect(adjustTab).toHaveAttribute("aria-selected", "true");
    expect((await state()).selectedLayerId).toBe(selectedLayerId);
    await page.keyboard.press("Enter");
    expect((await state()).selectedLayerId).toBe(scene?.layers[0].id);
    await page
      .getByRole("button", { name: "Select Brush", exact: true })
      .click();
    await expect(canvas).toBeVisible();
  });
  await test.step("Subtract adds a brush inside a gradient, and erasing it restores the gradient", async () => {
    await page.keyboard.press("l");
    await drag(
      page,
      [center[0], center[1] - 200 * scale],
      [center[0], center[1] + 200 * scale],
    );
    await setField("Exposure", "1");
    const lit = await samples();
    expect(lit[1][0]).toBeGreaterThan(original[1][0] + 20);
    await page
      .getByRole("button", { name: "Linear Gradient actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Subtract from mask", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Brush", exact: true }).click();
    const dot = [center[0], center[1] - 300 * scale];
    await drag(page, dot, [dot[0], dot[1] + 1], 2);
    expect((await state()).scene?.layers.at(-1)?.children).toMatchObject([
      { operation: "subtract", mask: { kind: "brush" } },
    ]);
    expect((await samples())[1]).toEqual(original[1]);
    await page.keyboard.down("Alt");
    await drag(page, dot, [dot[0], dot[1] + 1], 2);
    await page.keyboard.up("Alt");
    expect((await samples())[1]).toEqual(lit[1]);
  });
  await test.step("Escape climbs from the child mask to its parent and the image", async () => {
    const { selectedLayerId, scene } = await state();
    const gradient = scene?.layers.at(-1);
    expect(selectedLayerId).toBe(gradient?.children[0].id);
    await page.keyboard.press("Escape");
    await expect(adjustTab).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    expect((await state()).selectedLayerId).toBe(gradient?.id);
    await page.keyboard.press("Escape");
    expect((await state()).selectedLayerId).toBe(scene?.layers[0].id);
  });
});

test.describe("on a touch phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  test("a second finger during a touch stroke cancels it and pinches instead", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page
      .locator('input[type="file"]')
      .setInputFiles("tests/fixtures/photo.svg");
    await expect(
      page.getByRole("slider", { name: "Exposure", exact: true }),
    ).toHaveAttribute("aria-valuetext", "0.00");
    await page.getByRole("tab", { name: "Brush", exact: true }).click();
    const bounds = await box(page.getByLabel("Brush canvas", { exact: true }));
    const zoom = page.getByRole("button", { name: /^\d+%$/ });
    const fitted = await zoom.innerText();
    const [x, y] = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
    const touch = await context.newCDPSession(page);
    const send = (
      type: "touchStart" | "touchMove" | "touchEnd",
      at: number[],
    ) =>
      touch.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: at.map((dx) => ({ x: x + dx, y })),
      });
    await send("touchStart", [-40]);
    await send("touchMove", [-20]);
    await send("touchStart", [-20, 40]);
    for (let step = 1; step <= 6; step++) {
      await send("touchMove", [-20 - step * 8, 40 + step * 8]);
    }
    await send("touchEnd", []);
    await expect(zoom).not.toHaveText(fitted);
    expect(
      await page.evaluate(() => window.openlight.getState()),
    ).toMatchObject({
      scene: { layers: [{}, { mask: { strokes: [] } }] },
      history: { editing: false },
    });
  });

  test("a second finger landing on another patch during a healing stroke pinches instead of selecting it", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page
      .locator('input[type="file"]')
      .setInputFiles("tests/fixtures/photo.svg");
    await expect(
      page.getByRole("slider", { name: "Exposure", exact: true }),
    ).toHaveAttribute("aria-valuetext", "0.00");
    // A patch right of the photo's center, where the second finger lands.
    await page.evaluate(() => {
      const api = window.openlight;
      api.addHealPatch(
        api.addLayer("heal"),
        {
          mode: "paint",
          size: 160,
          feather: 0,
          flow: 1,
          points: [[900, 400, 1]],
        },
        [-300, 0],
      );
    });
    const before = await page.evaluate(() => window.openlight.getState());
    await page.getByRole("tab", { name: "Healing", exact: true }).click();
    const canvas = page.getByLabel("Healing canvas", { exact: true });
    const bounds = await box(canvas);
    // The fitted photo's pixels per source pixel, inside the viewport's padding.
    const scale = Math.min(
      (bounds.width - 48) / 1200,
      (bounds.height - 48) / 800,
    );
    const zoom = page.getByRole("button", { name: /^\d+%$/ });
    const fitted = await zoom.innerText();
    const [x, y] = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
    const patch = 300 * scale;
    const touch = await context.newCDPSession(page);
    const send = (
      type: "touchStart" | "touchMove" | "touchEnd",
      at: number[],
    ) =>
      touch.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: at.map((dx) => ({ x: x + dx, y })),
      });
    // The first finger paints left of the patch; the second lands on it, then both spread.
    await send("touchStart", [-patch]);
    await send("touchMove", [-patch + 10]);
    await send("touchStart", [-patch + 10, patch]);
    for (let step = 1; step <= 6; step++) {
      await send("touchMove", [-patch + 10 - step * 8, patch + step * 8]);
    }
    await send("touchEnd", []);
    await expect(zoom).not.toHaveText(fitted);
    const after = await page.evaluate(() => window.openlight.getState());
    expect(after.scene).toEqual(before.scene);
    expect(after.history).toEqual(before.history);
    await expect(
      canvas.locator('[data-heal-destination-handle="true"]'),
    ).toHaveCount(0);
  });
});
