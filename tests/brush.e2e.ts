import type { Page } from "@playwright/test";
import { expect, expectNear, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box, drag } from "./pointer";

function expectPixels(
  actual: readonly number[][],
  expected: readonly (readonly number[])[],
  tolerance?: number,
) {
  expect(actual).toHaveLength(expected.length);
  for (const [i, pixel] of expected.entries()) {
    expectNear(actual[i], pixel, tolerance);
  }
}

/** Mean red over green across a small square at the displayed canvas's center, as the mask overlay tints it. */
async function redness(page: Page) {
  const bytes = await page
    .getByRole("region", { name: "Image canvas" })
    .locator("canvas")
    .screenshot();
  return page.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot read preview pixels.");
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(
        image.width / 2 - 10,
        image.height / 2 - 10,
        21,
        21,
      );
      image.close();
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] - data[i + 1];
      return sum / (data.length / 4);
    },
    [...bytes],
  );
}

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
    expectPixels(await samples(), original, 1);
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
    expectNear(above, original[1], 1);
    await page.mouse.move(bounds.x + 20, bounds.y + 20);
    const untinted = await redness(page);
    await page.keyboard.press("o");
    await expect.poll(() => redness(page)).toBeGreaterThan(untinted + 20);
    await page.keyboard.press("o");
    await expect.poll(() => redness(page)).toBeLessThan(untinted + 5);
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
    expectNear((await samples())[0], original[0], 1);
    await page.keyboard.press("ControlOrMeta+z");
    expectPixels(await samples(), painted, 1);
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
    expectNear((await samples())[1], original[1], 1);
    await page.keyboard.down("Alt");
    await drag(page, dot, [dot[0], dot[1] + 1], 2);
    await page.keyboard.up("Alt");
    expectNear((await samples())[1], lit[1], 1);
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

  test("a second finger during a touch stroke cancels it and pinches instead, even over a healing patch", async ({
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
    const zoom = page.getByRole("button", { name: /^\d+%$/ });
    const fit = await zoom.innerText();
    const touch = await context.newCDPSession(page);
    /** The first finger paints from `start`, the second lands at `land`, offsets from the canvas center; then both spread. */
    async function pinch(canvas: string, start: number, land: number) {
      const bounds = await box(page.getByLabel(canvas, { exact: true }));
      const [x, y] = [
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      ];
      const send = (
        type: "touchStart" | "touchMove" | "touchEnd",
        at: number[],
      ) =>
        touch.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: at.map((dx) => ({ x: x + dx, y })),
        });
      await send("touchStart", [start]);
      await send("touchMove", [start + 10]);
      await send("touchStart", [start + 10, land]);
      for (let step = 1; step <= 6; step++) {
        await send("touchMove", [start + 10 - step * 8, land + step * 8]);
      }
      await send("touchEnd", []);
      await expect(zoom).not.toHaveText(fit);
    }

    await test.step("on a brush mask", async () => {
      await page.getByRole("tab", { name: "Brush", exact: true }).click();
      await pinch("Brush canvas", -30, 40);
      expect(
        await page.evaluate(() => window.openlight.getState()),
      ).toMatchObject({
        scene: { layers: [{}, { mask: { strokes: [] } }] },
        history: { editing: false },
      });
    });

    await test.step("with the second finger on another healing patch", async () => {
      await zoom.click();
      await expect(zoom).toHaveText(fit);
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
      await page.getByRole("tab", { name: "Healing", exact: true }).click();
      const canvas = page.getByLabel("Healing canvas", { exact: true });
      const before = await page.evaluate(() => window.openlight.getState());
      const bounds = await box(canvas);
      // The fitted photo's pixels per source pixel, inside the viewport's padding.
      const patch =
        300 * Math.min((bounds.width - 48) / 1200, (bounds.height - 48) / 800);
      await pinch("Healing canvas", -patch, patch);
      const after = await page.evaluate(() => window.openlight.getState());
      expect(after.scene).toEqual(before.scene);
      expect(after.history).toEqual(before.history);
      await expect(
        canvas.locator('[data-heal-destination-handle="true"]'),
      ).toHaveCount(0);
    });
  });
});
