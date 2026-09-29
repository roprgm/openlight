import { readFile } from "node:fs/promises";
import { interpolatePchip } from "@/lib/math";
import { expect, openPhoto, test } from "./fixtures";
import { readImage, readPixel, readPreview } from "./images";
import { box, choose, drag, zoom } from "./pointer";

test("edit a photo, inspect the preview and histograms, undo changes, and export", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  await openPhoto(page);
  const canvas = page
    .getByRole("region", { name: "Image canvas" })
    .locator("canvas");
  const output = page
    .getByLabel("output histogram", { exact: true })
    .locator("polyline")
    .first();
  await expect(output).toHaveAttribute("points", /,\d{1,2}\./);
  const original = await canvas.screenshot();
  const histogram = (await output.getAttribute("points")) ?? "";
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
    await canvas.hover();
    await zoom(page, 2);
    // Only a zoomed photo reaches past the fitted margin to the top edge.
    await expect
      .poll(() => readPixel(page, { x, y: viewport.y + 4 }))
      .toEqual([128, 128, 128, 255]);
    await canvas.dblclick();
    await expect.poll(() => canvas.screenshot()).toEqual(original);
    const scale = Math.min(
      (viewport.width - 48) / 1200,
      (viewport.height - 48) / 800,
    );
    const blue = { x: x + (430 - 600) * scale, y: y + (150 - 400) * scale };
    expect(await readPixel(page, blue)).toEqual([48, 80, 128, 255]);
    // Releasing Space mid-drag keeps the pan going.
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(x + 100, y);
    await page.keyboard.up("Space");
    await page.mouse.move(x + 101, y);
    await page.mouse.up();
    await expect
      .poll(() => readPixel(page, { ...blue, x: blue.x + 101 }))
      .toEqual([48, 80, 128, 255]);
    expect(await state()).toEqual(initial);
    await canvas.dblclick();
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
    await expect(output).not.toHaveAttribute("points", histogram);
    expect((await readImage(page)).center[0]).toBeGreaterThan(160);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(exposure).toHaveValue("0");
    await expect.poll(() => canvas.screenshot()).toEqual(original);
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
    const center = async () => (await readPreview(page)).center;
    const compare = page.getByRole("button", {
      name: "Compare before and after",
      exact: true,
    });
    await compare.focus();
    await page.keyboard.down("Backslash");
    await expect.poll(center).toEqual([128, 128, 128, 255]);
    await page.keyboard.up("Backslash");
    await expect.poll(center).toEqual([255, 255, 255, 255]);
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
    await expect.poll(center).toEqual([128, 128, 128, 255]);
    await compare.click();
    const shadows = page.getByRole("button", { name: "Show clipped shadows" });
    const highlights = page.getByRole("button", {
      name: "Show clipped highlights",
    });
    await shadows.click();
    await highlights.click();
    await expect.poll(center).toEqual([255, 0, 0, 255]);
    expect((await readPreview(page)).blue).toBeGreaterThan(100);
    expect(await readImage(page)).toEqual(edited);
    expect((await state()).history).toEqual(history);
    await shadows.click();
    await highlights.click();
    await page.evaluate(() => {
      window.openlight.setAdjustments({ exposure: 0 });
      window.openlight.setToneCurve();
    });
    await expect.poll(() => canvas.screenshot()).toEqual(original);
  });

  await test.step("clarity and sharpening edit a Details effect", async () => {
    await page.getByRole("button", { name: "Add effect", exact: true }).click();
    await page.getByRole("menuitem", { name: "Details", exact: true }).click();
    await type("Clarity", "-100");
    expect((await readImage(page)).corner[0]).toBeGreaterThan(0);
    const clarity = page.getByRole("slider", { name: "Clarity", exact: true });
    await clarity.locator("..").dblclick();
    await expect(clarity).toHaveValue("0");
    const edge = () => readImage(page, undefined, [[102, 50]]);
    await type("Sharpening", "100");
    await type("Radius", "3");
    expect((await edge()).samples?.[0][0]).toBeGreaterThan(40);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await edge()).samples?.[0][0]).toBe(32);
    await expect(output).toHaveAttribute("points", histogram);
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
    await expect(input).toHaveAttribute("points", /,\d{1,2}\./);
    const points = (await input.getAttribute("points")) ?? "";
    const bounds = await box(graph);
    const x = bounds.x + bounds.width / 2;
    await drag(
      page,
      [x, bounds.y + bounds.height / 2],
      [x, bounds.y + bounds.height / 4],
    );
    await expect(graph.locator("circle")).toHaveCount(3);
    await expect(input).toHaveAttribute("points", points);
    const curve = interpolatePchip((await state()).toneCurve);
    const expected = curve(adjusted.center[0] / 255) * 255;
    expect(Math.abs((await readImage(page)).center[0] - expected)).toBeLessThan(
      2,
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
    expect(Math.abs((await readImage(page)).corner[0] - 64)).toBeLessThan(2);
    await page.getByRole("button", { name: "Reset curve" }).click();
    await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0 }));
    await expect.poll(() => canvas.screenshot()).toEqual(original);
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
    expect(expected.center).not.toEqual([128, 128, 128, 255]);
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
    expect(Math.abs(jpeg.center[0] - expected.center[0])).toBeLessThanOrEqual(
      3,
    );
    await choose(page, format, "WebP");
    await type("Width", "600");
    await expect(panel.getByRole("textbox", { name: "Height" })).toHaveValue(
      "400",
    );
    const webp = await readImage(page, await save("photo.webp"));
    expect(webp.size).toEqual([600, 400]);
    expect(Math.abs(webp.center[0] - expected.center[0])).toBeLessThanOrEqual(
      3,
    );
    await page.keyboard.press("a");
  });

  await test.step("a mask's curve input weighs its coverage and stays while the mask is hidden", async () => {
    const plot = page
      .getByLabel("curve input histogram", { exact: true })
      .locator("polyline");
    await expect(plot).toHaveAttribute("points", /,\d{1,2}\./);
    const whole = (await plot.getAttribute("points")) ?? "";
    const mask = await page.evaluate(() => {
      const mask = window.openlight.addLayer("mask");
      window.openlight.setLayer(mask, { name: "Curve input mask" });
      return mask;
    });
    // A neutral mask receives the same pixels, counted only where it covers them.
    await expect(plot).toHaveAttribute("points", /,\d{1,2}\./);
    await expect(plot).not.toHaveAttribute("points", whole);
    await page.evaluate(
      (mask) => window.openlight.setAdjustments({ exposure: 1 }, mask),
      mask,
    );
    await expect(plot).toHaveAttribute("points", /,\d{1,2}\./);
    const points = (await plot.getAttribute("points")) ?? "";
    await page
      .getByRole("button", { name: "Show Curve input mask", exact: true })
      .click();
    await expect(plot).toHaveAttribute("points", points);
  });
});
