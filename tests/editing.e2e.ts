import { readFile } from "node:fs/promises";
import { interpolatePchip } from "@/lib/math";
import { expect, test } from "./fixtures";
import { readImage, readPixel, readPreview } from "./images";
import { box, choose, drag, zoom } from "./pointer";

test("edit a photo, inspect the preview and histograms, undo changes, and export", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const state = () => page.evaluate(() => window.openlight.getState());
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "choose a file" }),
  ).toBeVisible();
  // The start screen has no layer stack until a document opens.
  await expect(page.getByRole("heading", { name: "Layers" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Adjust" })).toBeDisabled();
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  const canvas = page
    .getByRole("region", { name: "Image canvas" })
    .locator("canvas");
  const output = page
    .getByLabel("output histogram", { exact: true })
    .locator("polyline")
    .first();
  await expect(
    page.getByLabel("output histogram", { exact: true }).locator("polygon"),
  ).toHaveCount(3);
  await expect(output).toHaveAttribute("points", /,\d{1,2}\./);
  const original = await canvas.screenshot();
  const histogram = await output.getAttribute("points");
  const initial = await state();
  expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);

  await test.step("image adjustments share a single section", async () => {
    await expect(
      page.getByRole("heading", { name: "Adjustments", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("slider", { name: "Clarity", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("slider", { name: "Exposure", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("slider", { name: "Temp", exact: true }),
    ).toBeVisible();
  });

  await test.step("zoomed rendering reaches the edges of the editor viewport", async () => {
    const viewport = await page
      .getByRole("region", { name: "Image canvas" })
      .boundingBox();
    if (!viewport) throw new Error("Missing editor viewport.");
    expect(await canvas.boundingBox()).toEqual(viewport);
    await canvas.hover();
    await zoom(page, 2);
    const edge = {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + 4,
      width: 1,
      height: 1,
    };
    await expect
      .poll(async () => await readPixel(page, edge))
      .toEqual([128, 128, 128, 255]);
    await canvas.dblclick();
    await expect.poll(() => canvas.screenshot()).toEqual(original);
  });

  await test.step("Space panning continues smoothly after releasing the key mid-drag", async () => {
    const viewport = await canvas.boundingBox();
    if (!viewport) throw new Error("Missing canvas.");
    const scale = Math.min(
      (viewport.width - 48) / 1200,
      (viewport.height - 48) / 800,
      2,
    );
    const sample = {
      x: viewport.x + viewport.width / 2 + (430 - 600) * scale,
      y: viewport.y + viewport.height / 2 + (150 - 400) * scale,
      width: 1,
      height: 1,
    };
    expect(await readPixel(page, sample)).toEqual([48, 80, 128, 255]);
    await canvas.hover();
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(
      viewport.x + viewport.width / 2 + 100,
      viewport.y + viewport.height / 2,
    );
    await page.keyboard.up("Space");
    await page.mouse.move(
      viewport.x + viewport.width / 2 + 101,
      viewport.y + viewport.height / 2,
    );
    await page.mouse.up();
    await expect
      .poll(async () => await readPixel(page, { ...sample, x: sample.x + 101 }))
      .toEqual([48, 80, 128, 255]);
    expect(await state()).toEqual(initial);
    await canvas.dblclick();
    await expect.poll(() => canvas.screenshot()).toEqual(original);
  });

  await test.step("exposure moves the preview and RGB histogram, then resets", async () => {
    const exposure = page.getByRole("slider", {
      name: "Exposure",
      exact: true,
    });
    await exposure.focus();
    await page.keyboard.down("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("ArrowRight");
    expect((await state()).history.undoCount).toBe(1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(exposure).toHaveValue("0");
    // Base UI keeps the range input inside the thumb, on the bar a person drags.
    const bounds = await box(
      exposure.locator('xpath=ancestor::*[@data-slot="slider-track"]'),
    );
    await drag(
      page,
      [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
      [bounds.x + bounds.width * 0.6, bounds.y + bounds.height / 2],
      8,
    );
    expect((await state()).history.undoCount).toBe(1);
    await expect.poll(() => canvas.screenshot()).not.toEqual(original);
    await expect(output).not.toHaveAttribute("points", histogram ?? "");
    expect((await readImage(page)).center[0]).toBeGreaterThan(160);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => canvas.screenshot()).toEqual(original);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(() => canvas.screenshot()).not.toEqual(original);
    await exposure.locator("..").dblclick();
    await expect(exposure).toHaveValue("0");
    await expect(output).toHaveAttribute("points", histogram ?? "");
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
    const before = page.getByRole("button", {
      name: "Compare before and after",
      exact: true,
    });
    const shadows = page.getByRole("button", { name: "Show clipped shadows" });
    const highlights = page.getByRole("button", {
      name: "Show clipped highlights",
    });
    const edited = await readImage(page);
    const history = (await state()).history;
    const bins = await output.getAttribute("points");
    await before.focus();
    await page.keyboard.down("Backslash");
    await expect(before).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await readPreview(page)).center)
      .toEqual([128, 128, 128, 255]);
    await page.keyboard.up("Backslash");
    await expect
      .poll(async () => (await readPreview(page)).center)
      .toEqual([255, 255, 255, 255]);
    await before.click();
    const divider = page.getByRole("slider", {
      name: "Before and after divider",
    });
    await expect(divider).toHaveAttribute("aria-valuenow", "50");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Preview is missing.");
    await divider.hover();
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.8,
      bounds.y + bounds.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(divider).toHaveAttribute("aria-valuenow", "80");
    await expect
      .poll(async () => (await readPreview(page)).center)
      .toEqual([128, 128, 128, 255]);
    await divider.press("Home");
    await expect
      .poll(async () => (await readPreview(page)).center)
      .toEqual([255, 255, 255, 255]);
    await divider.press("End");
    await expect
      .poll(async () => (await readPreview(page)).center)
      .toEqual([128, 128, 128, 255]);
    await divider.press("Shift+ArrowLeft");
    await expect(divider).toHaveAttribute("aria-valuenow", "90");
    await page.keyboard.down("Backslash");
    await expect(divider).toBeHidden();
    await page.keyboard.up("Backslash");
    await expect(divider).toHaveAttribute("aria-valuenow", "90");
    await before.click();
    await expect(divider).toBeHidden();
    await page.keyboard.down("Backslash");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(before).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.up("Backslash");
    const field = page.getByRole("textbox", { name: "Exposure", exact: true });
    await field.focus();
    await page.keyboard.press("Backslash");
    await expect(before).toHaveAttribute("aria-pressed", "false");
    await field.press("Escape");
    await shadows.click();
    await expect
      .poll(async () => (await readPreview(page)).blue)
      .toBeGreaterThan(100);
    await highlights.click();
    await expect
      .poll(async () => (await readPreview(page)).center)
      .toEqual([255, 0, 0, 255]);
    await expect
      .poll(async () => (await readPreview(page)).blue)
      .toBeGreaterThan(100);
    await before.click();
    await expect
      .poll(async () => (await readPreview(page)).center)
      .toEqual([128, 128, 128, 255]);
    expect(await readImage(page)).toEqual(edited);
    expect((await state()).history).toEqual(history);
    await expect(output).toHaveAttribute("points", bins ?? "");
    await page.evaluate(() =>
      window.openlight.setPreview({
        comparison: "edited",
        shadows: false,
        highlights: false,
      }),
    );
    await expect(highlights).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => (await readPreview(page)).blue).toBe(0);
    await page.evaluate(() => {
      window.openlight.setAdjustments({ exposure: 0 });
      window.openlight.setToneCurve();
    });
    await expect.poll(() => canvas.screenshot()).toEqual(original);
  });

  await test.step("light and color controls render together and reset", async () => {
    for (const [label, value] of [
      ["Highlights", -50],
      ["Shadows", 50],
      ["Whites", 25],
      ["Blacks", -25],
    ] as const) {
      const field = page.getByRole("textbox", { name: label, exact: true });
      await field.fill(String(value));
      await field.press("Enter");
      await expect(
        page.getByRole("slider", { name: label, exact: true }),
      ).toHaveValue(String(value));
    }
    await page.evaluate(() =>
      window.openlight.setAdjustments({
        contrast: 20,
        incrementalTemperature: 15,
        incrementalTint: -10,
        vibrance: 30,
        saturation: -20,
      }),
    );
    await expect.poll(() => canvas.screenshot()).not.toEqual(original);
    await expect(output).not.toHaveAttribute("points", histogram ?? "");
    const edited = await readImage(page);
    expect(edited.center).not.toEqual([128, 128, 128, 255]);
    await page.evaluate(
      (adjustments) => window.openlight.setAdjustments(adjustments),
      initial.adjustments,
    );
    await expect.poll(() => canvas.screenshot()).toEqual(original);
  });

  await test.step("clarity changes local contrast and histogram, then undoes and resets", async () => {
    await page.getByRole("button", { name: "Add effect", exact: true }).click();
    await page.getByRole("menuitem", { name: "Details", exact: true }).click();
    const field = page.getByRole("textbox", { name: "Clarity", exact: true });
    const slider = page.getByRole("slider", { name: "Clarity", exact: true });
    await field.fill("100");
    await field.press("Enter");
    await expect(slider).toHaveValue("100");
    await expect(output).not.toHaveAttribute("points", histogram ?? "");
    const positive = await readImage(page);
    expect(positive.center).toEqual([128, 128, 128, 255]);
    expect(positive.corner).toEqual([0, 0, 0, 255]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(slider).toHaveValue("0");
    expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
    await field.fill("-100");
    await field.press("Enter");
    expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
    expect((await readImage(page)).corner[0]).toBeGreaterThan(0);
    await slider.locator("..").dblclick();
    await expect(slider).toHaveValue("0");
    await expect(output).toHaveAttribute("points", histogram ?? "");
  });

  await test.step("sharpening amount and radius edit, undo, and reset", async () => {
    const amount = page.getByRole("textbox", {
      name: "Sharpening",
      exact: true,
    });
    const radius = page.getByRole("textbox", { name: "Radius", exact: true });
    await amount.fill("100");
    await amount.press("Enter");
    await radius.fill("3");
    await radius.press("Enter");
    await expect(output).not.toHaveAttribute("points", histogram ?? "");
    expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(radius).toHaveValue("1.0");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(amount).toHaveValue("0");
    await expect(output).toHaveAttribute("points", histogram ?? "");
    await amount.fill("150");
    await amount.press("Enter");
    await page
      .getByRole("slider", { name: "Sharpening", exact: true })
      .locator("..")
      .dblclick();
    await expect(amount).toHaveValue("0");
  });

  await test.step("curve gestures change output after adjustments and undo as one edit", async () => {
    await page.evaluate(() =>
      window.openlight.setAdjustments({ exposure: -1 }),
    );
    const adjusted = await readImage(page);
    await page.getByRole("button", { name: "photo.svg", exact: true }).click();
    const graph = page.getByRole("application", { name: "Tone curve" });
    const curveHistogram = page
      .getByLabel("curve input histogram", { exact: true })
      .locator("polyline");
    await graph.scrollIntoViewIfNeeded();
    await expect(curveHistogram).toHaveAttribute("points", /,\d{1,2}\./);
    const curveInput = await curveHistogram.getAttribute("points");
    const before = await page.evaluate(
      () => window.openlight.getState().history.undoCount,
    );
    const bounds = await graph.boundingBox();
    if (!bounds) throw new Error("Curve graph is missing.");
    await drag(
      page,
      [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
      [bounds.x + bounds.width / 2, bounds.y + bounds.height / 4],
      8,
    );
    await expect(graph.locator("circle")).toHaveCount(3);
    await expect(curveHistogram).toHaveAttribute("points", curveInput ?? "");
    expect((await state()).history.undoCount).toBe(before + 1);
    const curved = await readImage(page);
    const curve = await page.evaluate(
      () => window.openlight.getState().toneCurve,
    );
    const expected = interpolatePchip(curve)(adjusted.center[0] / 255) * 255;
    expect(Math.abs(curved.center[0] - expected)).toBeLessThan(2);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await readImage(page)).toEqual(adjusted);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect(await readImage(page)).toEqual(curved);
    await graph.press("Shift+ArrowDown");
    await graph.press("Delete");
    await expect(graph.locator("circle")).toHaveCount(2);
    expect(await readImage(page)).toEqual(adjusted);
    await graph.press("Enter");
    await graph.press("ArrowUp");
    await expect(graph.locator("circle")).toHaveCount(3);
    await page.getByRole("button", { name: "Reset curve" }).click();
    await expect(graph.locator("circle")).toHaveCount(2);
    await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0 }));
    await expect.poll(() => canvas.screenshot()).toEqual(original);
    for (const { from, to, sample, expected } of [
      { from: [0, 1], to: [0, 0.75], sample: "corner", expected: 64 },
      { from: [1, 0], to: [0.1, 0], sample: "center", expected: 255 },
    ] as const) {
      await graph.scrollIntoViewIfNeeded();
      const bounds = await box(graph);
      await drag(
        page,
        [
          bounds.x + 1 + from[0] * (bounds.width - 2),
          bounds.y + 1 + from[1] * (bounds.height - 2),
        ],
        [bounds.x + to[0] * bounds.width, bounds.y + to[1] * bounds.height],
        5,
      );
      expect(
        Math.abs((await readImage(page))[sample][0] - expected),
      ).toBeLessThan(2);
      await graph.dblclick({
        position: { x: to[0] * bounds.width, y: to[1] * bounds.height },
      });
      expect(
        await page.evaluate(() => window.openlight.getState().toneCurve),
      ).toEqual(initial.toneCurve);
    }
  });

  await page.getByRole("button", { name: "photo.svg", exact: true }).click();
  await test.step("a mask's curve input weighs its coverage and stays while the mask is hidden", async () => {
    const plot = page
      .getByLabel("curve input histogram", { exact: true })
      .locator("polyline");
    await expect(plot).toHaveAttribute("points", /,\d{1,2}\./);
    const whole = await plot.getAttribute("points");
    await page.evaluate(() => {
      const api = window.openlight;
      const mask = api.addLayer("mask");
      api.setLayer(mask, { name: "Curve input mask" });
    });
    // A neutral mask receives the same pixels, counted only where it covers them.
    await expect(plot).toHaveAttribute("points", /,\d{1,2}\./);
    await expect(plot).not.toHaveAttribute("points", whole ?? "");
    await page.evaluate(() => {
      const api = window.openlight;
      api.setAdjustments({ exposure: 1 }, api.getState().selectedLayerId);
    });
    await expect(plot).toHaveAttribute("points", /,\d{1,2}\./);
    const points = await plot.getAttribute("points");
    await page
      .getByRole("button", { name: "Show Curve input mask", exact: true })
      .click();
    await expect(plot).toHaveAttribute("points", points ?? "");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(plot).toHaveAttribute("points", points ?? "");
    await page.evaluate(() => {
      const api = window.openlight;
      const mask = api.getState().selectedLayerId;
      if (!mask) throw Error("Missing mask selection.");
      api.deleteLayer(mask);
    });
  });
  await page.getByRole("button", { name: "photo.svg", exact: true }).click();
  await test.step("mode bar switches panels by click, arrow keys, and letters", async () => {
    const modes = page.getByRole("tablist", { name: "Tools" });
    const selected = modes.getByRole("tab", { selected: true });
    await expect(selected).toHaveAccessibleName("Adjust");
    const exportButton = page.getByRole("button", {
      name: "Export",
      exact: true,
    });
    await exportButton.click();
    await expect(exportButton).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("region", { name: "Image export" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Layers", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(selected).toHaveAccessibleName("Adjust");
    await expect(
      page.getByRole("region", { name: "Layers", exact: true }),
    ).toBeVisible();
    await modes.getByRole("tab", { name: "Crop" }).click();
    await expect(selected).toHaveAccessibleName("Crop");
    await page.keyboard.press("ArrowLeft");
    await expect(selected).toHaveAccessibleName("Healing");
    await page.keyboard.press("ArrowLeft");
    await expect(selected).toHaveAccessibleName("Radial gradient");
    await expect(
      page.getByRole("heading", { name: "Adjustments", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(selected).toHaveAccessibleName("Brush");
    await page.keyboard.press("ArrowLeft");
    await expect(selected).toHaveAccessibleName("Adjust");
    await expect(selected).toBeFocused();
    await page.keyboard.press("e");
    await expect(exportButton).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("a");
    await expect(selected).toHaveAccessibleName("Adjust");
    await expect(page.getByRole("slider", { name: "Exposure" })).toBeVisible();
  });

  await test.step("export retains edits and original dimensions independently of viewport zoom", async () => {
    await page.evaluate(() => {
      window.openlight.beginEdit();
      window.openlight.setAdjustments({
        exposure: 1,
        highlights: -20,
        shadows: 30,
        whites: 10,
        blacks: -5,
      });
      window.openlight.setDetails({
        clarity: -50,
        sharpening: 100,
        sharpenRadius: 1,
      });
      window.openlight.setToneCurve([
        { x: 0, y: 0 },
        { x: 0.5, y: 0.75 },
        { x: 1, y: 1 },
      ]);
      window.openlight.commitEdit();
    });
    const expected = await readImage(page);
    expect(expected.center[0]).toBeGreaterThan(190);
    expect(expected.center[0]).toBeLessThan(255);
    expect(expected.corner[0]).toBeGreaterThan(0);
    expect(expected.corner[3]).toBe(255);
    await canvas.hover();
    await zoom(page, Math.E);
    const panel = page.getByRole("region", { name: "Image export" });
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const quality = panel.getByRole("textbox", { name: "Quality" });
    async function save(name: string) {
      const pending = page.waitForEvent("download");
      await panel.getByRole("button", { name: "Save image" }).click();
      const download = await pending;
      expect(download.suggestedFilename()).toBe(name);
      const path = await download.path();
      if (!path) throw new Error("Missing image download.");
      return readFile(path);
    }
    const format = panel.getByRole("combobox", { name: "Format" });
    await choose(page, format, "PNG");
    await expect(panel.getByRole("textbox", { name: "Width" })).toHaveValue(
      "1200",
    );
    await expect(panel.getByText(/kB|MB/)).toBeVisible();
    expect(await readImage(page, await save("photo.png"))).toEqual(expected);
    await choose(page, format, "JPEG");
    await expect(format).toContainText("JPEG");
    await quality.fill("20");
    await quality.press("Enter");
    const small = await save("photo.jpg");
    await quality.fill("95");
    await quality.press("Enter");
    const large = await save("photo.jpg");
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
    expect(large.length).toBeGreaterThan(small.length);
    for (const bytes of [small, large]) {
      const actual = await readImage(page, bytes);
      expect(actual.size).toEqual([1200, 800]);
      expect(
        Math.abs(actual.center[0] - expected.center[0]),
      ).toBeLessThanOrEqual(3);
    }
    expect(large.length).toBeGreaterThan(small.length);
    await choose(page, format, "WebP");
    const width = panel.getByRole("textbox", { name: "Width" });
    await width.fill("600");
    await width.press("Enter");
    await expect(panel.getByRole("textbox", { name: "Height" })).toHaveValue(
      "400",
    );
    const resized = await readImage(page, await save("photo.webp"));
    expect(resized.size).toEqual([600, 400]);
    expect(
      Math.abs(resized.center[0] - expected.center[0]),
    ).toBeLessThanOrEqual(3);
    await expect(quality).toHaveValue("95");
    await page.keyboard.press("a");
    await expect(panel).toBeHidden();
  });
});
