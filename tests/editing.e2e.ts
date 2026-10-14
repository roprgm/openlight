import { readFile } from "node:fs/promises";
import type { Locator } from "@playwright/test";
import { interpolatePchip } from "@/lib/math";
import { expect, expectNear, openPhoto, test } from "./fixtures";
import { readImage, readPixel, readPreview } from "./images";
import { box, choose, drag, zoom } from "./pointer";

/** A histogram's bin heights, 0 to 100, from the polyline its SVG draws downward. */
async function heights(plot: Locator) {
  const points = (await plot.getAttribute("points")) ?? "";
  return points
    .split(" ")
    .filter(Boolean)
    .map((point) => 100 - Number(point.split(",")[1]));
}

/** The height-weighted mean bin, which rises as the image brightens. */
function meanBin(heights: number[]) {
  const total = heights.reduce((sum, height) => sum + height, 0);
  return heights.reduce((sum, height, bin) => sum + height * bin, 0) / total;
}

/** The mean height difference between two histograms of the same bins. */
function difference(a: number[], b: number[]) {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  return (
    a.reduce((sum, height, bin) => sum + Math.abs(height - b[bin]), 0) /
    a.length
  );
}

/** The largest channel difference between two colors. */
function distance(a: number[], b: number[]) {
  return Math.max(...b.map((value, channel) => Math.abs(a[channel] - value)));
}

const isGray = (pixel: number[]) =>
  distance(pixel.slice(0, 3), [128, 128, 128]) <= 10;
const isBlue = (pixel: number[]) => pixel[2] - pixel[0] > 40;

test("edit a photo, inspect the preview and histograms, undo changes, and export", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const state = () => page.evaluate(() => window.openlight.getState());
  await openPhoto(page);
  // The experimental assistant mounts only for `/?assistant`.
  await expect(
    page.getByRole("button", { name: "Assistant", exact: true }),
  ).toBeHidden();
  const canvas = page
    .getByRole("region", { name: "Image canvas" })
    .locator("canvas");
  const output = page
    .getByLabel("output histogram", { exact: true })
    .locator("polyline")
    .first();
  const drawn = (plot: Locator) =>
    expect
      .poll(async () => Math.max(...(await heights(plot))))
      .toBeGreaterThan(1);
  await drawn(output);
  const histogram = await heights(output);
  /** The preview shows the unedited photo again, as its output histogram does. */
  const restored = () =>
    expect
      .poll(async () => difference(await heights(output), histogram))
      .toBeLessThan(0.5);
  const initial = await state();
  async function type(name: string, value: string) {
    const field = page.getByRole("textbox", { name, exact: true });
    await field.fill(value);
    await field.press("Enter");
  }

  await test.step("zoom and Space panning move only the view", async () => {
    const viewport = await box(canvas);
    const [x, y] = [
      viewport.x + viewport.width / 2,
      viewport.y + viewport.height / 2,
    ];
    const top = { x, y: viewport.y + 4 };
    const level = page.getByRole("button", { name: /^\d+%$/ });
    const fit = (await level.textContent()) ?? "";
    await canvas.hover();
    await zoom(page, 2);
    await expect(level).not.toHaveText(fit);
    // Only a zoomed photo reaches past the fitted margin to the top edge.
    await expect
      .poll(async () => isGray(await readPixel(page, top)))
      .toBe(true);
    await canvas.dblclick();
    await expect(level).toHaveText(fit);
    await expect
      .poll(async () => isGray(await readPixel(page, top)))
      .toBe(false);
    const scale = Math.min(
      (viewport.width - 48) / 1200,
      (viewport.height - 48) / 800,
    );
    const blue = { x: x + (430 - 600) * scale, y: y + (150 - 400) * scale };
    expect(isBlue(await readPixel(page, blue))).toBe(true);
    // Releasing Space mid-drag keeps the pan going.
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(x + 100, y);
    await page.keyboard.up("Space");
    await page.mouse.move(x + 101, y);
    await page.mouse.up();
    await expect
      .poll(async () =>
        isBlue(await readPixel(page, { ...blue, x: blue.x + 101 })),
      )
      .toBe(true);
    expect(await state()).toEqual(initial);
    await canvas.dblclick();
    await expect(level).toHaveText(fit);
  });

  await test.step("an exposure drag is one edit of the image and histogram", async () => {
    const exposure = page.getByRole("slider", {
      name: "Exposure",
      exact: true,
    });
    // Base UI keeps the range input inside the thumb, on the bar a person drags.
    const track = await box(
      exposure.locator('xpath=ancestor::*[@data-slot="slider-track"]'),
    );
    const y = track.y + track.height / 2;
    await drag(
      page,
      [track.x + track.width / 2, y],
      [track.x + track.width * 0.6, y],
    );
    await expect
      .poll(async () => meanBin(await heights(output)))
      .toBeGreaterThan(meanBin(histogram) + 10);
    expect((await readImage(page)).center[0]).toBeGreaterThan(160);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(exposure).toHaveValue("0");
    await restored();
  });

  await test.step("compare and clipping change only the preview", async () => {
    await page.evaluate(() => {
      window.openlight.setAdjustments({ exposure: 3 });
      window.openlight.setToneCurve([
        { x: 0, y: 0 },
        { x: 0.5, y: 1 },
        { x: 1, y: 1 },
      ]);
    });
    const edited = await readImage(page);
    const { history } = await state();
    const center = (expected: number[]) =>
      expect
        .poll(async () => distance((await readPreview(page)).center, expected))
        .toBeLessThanOrEqual(4);
    const compare = page.getByRole("button", {
      name: "Compare before and after",
      exact: true,
    });
    await compare.focus();
    await page.keyboard.down("Backslash");
    await center([128, 128, 128, 255]);
    await page.keyboard.up("Backslash");
    await center([255, 255, 255, 255]);
    await compare.click();
    const divider = page.getByRole("slider", {
      name: "Before and after divider",
    });
    const bounds = await box(canvas);
    await divider.hover();
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + 10);
    await page.mouse.up();
    await expect(divider).toHaveAttribute("aria-valuenow", "80");
    await center([128, 128, 128, 255]);
    await compare.click();
    const shadows = page.getByRole("button", { name: "Show clipped shadows" });
    const highlights = page.getByRole("button", {
      name: "Show clipped highlights",
    });
    await shadows.click();
    await highlights.click();
    await center([255, 0, 0, 255]);
    expect((await readPreview(page)).blue).toBeGreaterThan(100);
    expect(await readImage(page)).toEqual(edited);
    expect((await state()).history).toEqual(history);
    await shadows.click();
    await highlights.click();
    await page.evaluate(() => {
      window.openlight.setAdjustments({ exposure: 0 });
      window.openlight.setToneCurve();
    });
    await restored();
  });

  await test.step("clarity and sharpening edit a Details effect", async () => {
    await page.getByRole("button", { name: "Add effect", exact: true }).click();
    await page.getByRole("menuitem", { name: "Details", exact: true }).click();
    await type("Clarity", "-100");
    expect((await readImage(page)).corner[0]).toBeGreaterThan(0);
    const clarity = page.getByRole("slider", { name: "Clarity", exact: true });
    await clarity.locator("..").dblclick();
    await expect(clarity).toHaveValue("0");
    // Beside the black corner, on the dark strip.
    const edge = async () =>
      (await readImage(page, undefined, [[102, 50]])).samples?.[0];
    await type("Sharpening", "100");
    await type("Radius", "3");
    expect((await edge())?.[0]).toBeGreaterThan(40);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expectNear((await edge())?.slice(0, 3), [32, 32, 32]);
    await restored();
  });

  await test.step("a curve drag after adjustments is one edit", async () => {
    await page.evaluate(() =>
      window.openlight.setAdjustments({ exposure: -1 }),
    );
    const adjusted = await readImage(page);
    await page.getByRole("button", { name: "photo.svg", exact: true }).click();
    const graph = page.getByRole("application", { name: "Tone curve" });
    const input = page
      .getByLabel("curve input histogram", { exact: true })
      .locator("polyline");
    await graph.scrollIntoViewIfNeeded();
    await drawn(input);
    const before = await heights(input);
    const bounds = await box(graph);
    const x = bounds.x + bounds.width / 2;
    await drag(
      page,
      [x, bounds.y + bounds.height / 2],
      [x, bounds.y + bounds.height / 4],
    );
    await expect(graph.locator("circle")).toHaveCount(3);
    // The curve's input comes before the curve.
    expect(difference(await heights(input), before)).toBeLessThan(0.5);
    const curve = interpolatePchip((await state()).toneCurve);
    const expected = curve(adjusted.center[0] / 255) * 255;
    expect(Math.abs((await readImage(page)).center[0] - expected)).toBeLessThan(
      4,
    );
    await page.keyboard.press("ControlOrMeta+z");
    expect(await readImage(page)).toEqual(adjusted);
    // Raising the black point lifts the black corner.
    await drag(
      page,
      [bounds.x + 1, bounds.y + bounds.height - 1],
      [bounds.x, bounds.y + bounds.height * 0.75],
      5,
    );
    expect(Math.abs((await readImage(page)).corner[0] - 64)).toBeLessThan(4);
    await page.getByRole("button", { name: "Reset curve" }).click();
    await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0 }));
    await restored();
  });

  await test.step("the mode bar switches panels by click, arrow keys, and letters", async () => {
    const modes = page.getByRole("tablist", { name: "Tools" });
    const selected = modes.getByRole("tab", { selected: true });
    const layers = page.getByRole("region", { name: "Layers", exact: true });
    await modes.getByRole("tab", { name: "Crop" }).click();
    await page.keyboard.press("ArrowLeft");
    await expect(selected).toHaveAccessibleName("Healing");
    await page.keyboard.press("e");
    await expect(
      page.getByRole("region", { name: "Image export" }),
    ).toBeVisible();
    await expect(layers).toHaveCount(0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(layers).toBeVisible();
    await page.keyboard.press("a");
    await expect(selected).toHaveAccessibleName("Adjust");
  });

  await test.step("export keeps edits and size at any zoom, in PNG, JPEG and resized WebP", async () => {
    await page.evaluate(() => {
      window.openlight.beginEdit();
      window.openlight.setAdjustments({ exposure: 1, shadows: 30 });
      window.openlight.setDetails({ clarity: -50, sharpening: 100 });
      window.openlight.setToneCurve([
        { x: 0, y: 0 },
        { x: 0.5, y: 0.75 },
        { x: 1, y: 1 },
      ]);
      window.openlight.commitEdit();
    });
    const expected = await readImage(page);
    expect(expected.center[0]).toBeGreaterThan(160);
    await canvas.hover();
    await zoom(page, Math.E);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const panel = page.getByRole("region", { name: "Image export" });
    const format = panel.getByRole("combobox", { name: "Format" });
    async function save(name: string) {
      const pending = page.waitForEvent("download");
      await panel.getByRole("button", { name: "Save image" }).click();
      const download = await pending;
      expect(download.suggestedFilename()).toBe(name);
      const path = await download.path();
      if (!path) throw new Error("Missing image download.");
      return readFile(path);
    }
    await choose(page, format, "PNG");
    expect(await readImage(page, await save("photo.png"))).toEqual(expected);
    await choose(page, format, "JPEG");
    await type("Quality", "20");
    const small = await save("photo.jpg");
    await type("Quality", "95");
    const large = await save("photo.jpg");
    expect(large.length).toBeGreaterThan(small.length);
    // The estimate encodes what Save writes, so it matches the file within its rounding.
    const estimate = panel.getByText(/^[\d.,]+\s*(kB|MB)$/);
    await expect
      .poll(async () => {
        const text = (await estimate.textContent()) ?? "";
        const unit = text.includes("MB") ? 1e6 : 1e3;
        return Math.abs(
          Number(text.replace(/[^\d.]/g, "")) * unit - large.length,
        );
      })
      .toBeLessThan(Math.max(1000, large.length * 0.01));
    const jpeg = await readImage(page, large);
    expect(jpeg.size).toEqual([1200, 800]);
    expectNear(jpeg.center, expected.center, 4);
    await choose(page, format, "WebP");
    await type("Width", "600");
    await expect(panel.getByRole("textbox", { name: "Height" })).toHaveValue(
      "400",
    );
    const webp = await readImage(page, await save("photo.webp"));
    expect(webp.size).toEqual([600, 400]);
    expectNear(webp.center, expected.center, 4);
    await page.keyboard.press("a");
  });

  await test.step("a mask's curve input weighs its coverage and stays while the mask is hidden", async () => {
    const plot = page
      .getByLabel("curve input histogram", { exact: true })
      .locator("polyline");
    await drawn(plot);
    const whole = await heights(plot);
    const mask = await page.evaluate(() => {
      const mask = window.openlight.addLayer("mask");
      window.openlight.setLayer(mask, { name: "Curve input mask" });
      return mask;
    });
    // A neutral mask receives the same pixels, counted only where it covers them.
    await expect
      .poll(async () => {
        const now = await heights(plot);
        return Math.max(...now) > 1 && difference(now, whole) > 1;
      })
      .toBe(true);
    const neutral = await heights(plot);
    await page.evaluate(
      (mask) => window.openlight.setAdjustments({ exposure: 1 }, mask),
      mask,
    );
    await expect
      .poll(async () => meanBin(await heights(plot)))
      .toBeGreaterThan(meanBin(neutral) + 2);
    const brighter = await heights(plot);
    await page
      .getByRole("button", { name: "Show Curve input mask", exact: true })
      .click();
    expect(difference(await heights(plot), brighter)).toBeLessThan(0.5);
  });
});
