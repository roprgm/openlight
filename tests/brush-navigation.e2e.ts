import { expect, test } from "./fixtures";
import { readImage, readPixel } from "./images";
import { box } from "./pointer";

for (const { name, shortcut, presses, label } of [
  { name: "mask", shortcut: "b", presses: 1, label: "Brush canvas" },
  { name: "color", shortcut: "b", presses: 2, label: "Paint canvas" },
  { name: "retouch", shortcut: "h", presses: 1, label: "Healing canvas" },
]) {
  test(`${name} brush menu owns clicks and slider drags without painting or navigating`, async ({
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
    for (let i = 0; i < presses; i++) await page.keyboard.press(shortcut);
    const canvas = page.getByLabel(label, { exact: true });
    await expect(canvas).toBeVisible();
    const state = await page.evaluate(() => window.openlight.getState());
    const zoom = page.getByRole("button", { name: /^\d+%$/ });
    const fit = await zoom.innerText();
    await canvas.click({ button: "right", position: { x: 300, y: 300 } });
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    const size = menu.getByRole("textbox", { name: "Size", exact: true });
    await size.click();
    await size.fill("80");
    await size.press("Enter");
    const feather = menu.getByRole("textbox", { name: "Feather", exact: true });
    await feather.click();
    await feather.fill("30");
    await feather.press("Enter");
    for (const name of ["Size", "Feather"]) {
      const thumb = menu.getByRole("slider", { name, exact: true });
      const initial = await thumb.getAttribute("aria-valuenow");
      const bounds = await box(thumb);
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + bounds.width / 2 + 30,
        bounds.y + bounds.height / 2,
        { steps: 4 },
      );
      await page.mouse.up();
      await expect(thumb).not.toHaveAttribute("aria-valuenow", initial ?? "");
    }
    // The viewport capture phase must also leave portaled controls alone while Space is held.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await page.keyboard.down("Space");
    await expect(canvas).toHaveAttribute("data-pan", "true");
    await size.click();
    await size.fill("90");
    await size.press("Enter");
    await page.keyboard.up("Space");
    const panel = await box(menu);
    await page.mouse.click(panel.x + panel.width / 2, panel.y + 6);
    await expect(menu).toBeVisible();
    await expect(zoom).toHaveText(fit);
    expect(await page.evaluate(() => window.openlight.getState())).toEqual(
      state,
    );
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(canvas).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Size", exact: true }),
    ).toHaveValue("90");
  });

  test(`${name} brush keeps its screen size across zoom while new strokes scale in the image`, async ({
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
    for (let i = 0; i < presses; i++) await page.keyboard.press(shortcut);
    const canvas = page.getByLabel(label, { exact: true });
    await expect(canvas).toBeVisible();
    const size = page.getByRole("textbox", { name: "Size", exact: true });
    await expect(size).toHaveValue("50");
    await size.fill("100");
    await size.press("Enter");
    const bounds = await box(canvas);
    const cursor = canvas.locator('[data-brush-cursor="true"] circle').first();
    const strokes = () =>
      page.evaluate(() => {
        const { scene, selectedLayerId } = window.openlight.getState();
        const layer = scene?.layers.find(
          (layer) => layer.id === selectedLayerId,
        );
        if (layer?.kind === "paint") return layer.strokes;
        if (layer?.kind === "mask" && layer.mask.kind === "brush")
          return layer.mask.strokes;
        if (layer?.kind === "heal")
          return layer.patches.flatMap((patch) => patch.strokes);
        return [];
      });
    const x = bounds.x + bounds.width / 2 + 180;
    const y = bounds.y + bounds.height / 2 + 120;
    await page.mouse.move(x, y);
    await expect(cursor).toHaveAttribute("r", "50");
    await page.mouse.click(x, y);
    await expect.poll(async () => (await strokes()).length).toBe(1);
    const first = (await strokes())[0];
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.mouse.move(x + 180, y);
    await expect(cursor).toHaveAttribute("r", "50");
    await expect(size).toHaveValue("100");
    await page.mouse.click(x + 180, y);
    await expect.poll(async () => (await strokes()).length).toBe(2);
    const recorded = await strokes();
    expect(recorded[0]).toEqual(first);
    expect(recorded[1].size).toBeCloseTo(first.size / 1.25 ** 2, 6);
    // Navigating does not resize existing content; each stroke remains one undo step.
    await page.keyboard.press("ControlOrMeta+z");
    expect(await strokes()).toEqual([first]);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect(await strokes()).toEqual(recorded);
    await page.getByRole("button", { name: /^\d+%$/ }).click();
    await page.mouse.move(x, y);
    await expect(cursor).toHaveAttribute("r", "50");
    await expect(size).toHaveValue("100");
  });

  test(`${name} wheel sizes the brush while pinch zoom and Space-drag navigate`, async ({
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
    for (let i = 0; i < presses; i++) await page.keyboard.press(shortcut);
    const canvas = page.getByLabel(label, { exact: true });
    await expect(canvas).toBeVisible();
    const size = page.getByRole("textbox", { name: "Size", exact: true });
    const feather = page.getByRole("textbox", {
      name: "Feather",
      exact: true,
    });
    await size.fill("50");
    await size.press("Enter");
    await feather.fill("30");
    await feather.press("Enter");
    const state = await page.evaluate(() => window.openlight.getState());
    const zoom = page.getByRole("button", { name: /^\d+%$/ });
    const fit = await zoom.innerText();
    const cursor = canvas.locator('[data-brush-cursor="true"]');
    const center = cursor.locator('[data-brush-center="true"]');
    await canvas.hover();
    await expect(center).toHaveCount(0);
    // Scrolling up enlarges the brush; scrolling down reduces it.
    await page.mouse.wheel(0, -100);
    await expect(size).toHaveValue("64");
    await page.mouse.wheel(0, 100);
    await expect(size).toHaveValue("50");
    // Several wheel events before a React render must accumulate, not overwrite each other.
    await canvas.evaluate((element) => {
      for (let i = 0; i < 2; i++) {
        element.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -100,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    });
    await expect(size).toHaveValue("82");
    await expect(feather).toHaveValue("30");
    await expect(zoom).toHaveText(fit);
    await size.fill("1");
    await size.press("Enter");
    await canvas.hover();
    await page.mouse.wheel(0, -100);
    await expect(size).toHaveValue("1");
    await page.mouse.wheel(0, -100);
    await expect(size).toHaveValue("2");
    await page.mouse.wheel(0, 100_000);
    await expect(size).toHaveValue("1");
    await page.mouse.wheel(0, -100_000);
    await expect(size).toHaveValue("1000");
    // Chromium represents a trackpad pinch as ctrl+wheel.
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -80);
    await page.keyboard.up("Control");
    await expect(zoom).not.toHaveText(fit);
    await expect(size).toHaveValue("1000");
    await expect(center).toHaveCount(1);
    // Sample both sides of a visible edge: either scroll direction would move it across a sample.
    const zoomBounds = await box(canvas);
    const zoomScale = Number.parseInt(await zoom.innerText(), 10) / 100;
    // Screenshots include the translucent cursor; keep it away from the sampled edge.
    await page.mouse.move(
      zoomBounds.x + zoomBounds.width - 16,
      zoomBounds.y + zoomBounds.height - 100,
    );
    const rendered = page
      .getByRole("region", { name: "Image canvas" })
      .locator("canvas");
    const edgeSamples = [440, 460].map(
      (x) =>
        [
          zoomBounds.width / 2 + (x - 600) * zoomScale,
          zoomBounds.height / 2 + (200 - 400) * zoomScale,
        ] as const,
    );
    const edgePixels = async () =>
      (await readImage(page, await rendered.screenshot(), edgeSamples)).samples;
    const expectedEdge = [
      [48, 80, 128, 255],
      [128, 128, 128, 255],
    ];
    await expect.poll(edgePixels).toEqual(expectedEdge);
    for (const x of [60, -60]) {
      await page.mouse.wheel(x, 0);
      await expect(size).toHaveValue("1000");
      await expect(zoom).not.toHaveText(fit);
      await expect.poll(edgePixels).toEqual(expectedEdge);
    }
    await zoom.click();
    await expect(zoom).toHaveText(fit);
    await size.fill("100");
    await size.press("Enter");
    await canvas.hover();
    await expect(center).toHaveCount(0);
    await page.mouse.wheel(300, -100);
    await expect(size).toHaveValue("128");
    await expect(center).toHaveCount(1);
    await size.fill("50");
    await size.press("Enter");
    // Tiny trackpad events preserve the same scale as one combined wheel event.
    await canvas.evaluate((element) => {
      for (let i = 0; i < 100; i++) {
        element.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -1,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    });
    await expect(size).toHaveValue("64");
    await size.fill("1");
    await size.press("Enter");
    await canvas.hover();
    await page.keyboard.press("]");
    await expect(size).toHaveValue("2");
    await page.keyboard.press("[");
    await expect(size).toHaveValue("1");
    await size.fill("128");
    await size.press("Enter");
    const bounds = await box(canvas);
    const scale = Math.min(
      (bounds.width - 48) / 1200,
      (bounds.height - 48) / 800,
      2,
    );
    const sample = {
      x: bounds.x + bounds.width / 2 + (430 - 600) * scale,
      y: bounds.y + bounds.height / 2 + (150 - 400) * scale,
    };
    await expect
      .poll(() => readPixel(page, sample))
      .toEqual([48, 80, 128, 255]);
    await canvas.hover();
    await page.keyboard.down("Space");
    await expect(canvas).toHaveAttribute("data-pan", "true");
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 100,
      bounds.y + bounds.height / 2,
    );
    await page.keyboard.up("Space");
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 101,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.up();
    await expect
      .poll(() => readPixel(page, { ...sample, x: sample.x + 101 }))
      .toEqual([48, 80, 128, 255]);
    await page.keyboard.down("Space");
    await expect(center).toHaveCount(0);
    await page.mouse.wheel(60, 40);
    await page.keyboard.up("Space");
    await expect(size).toHaveValue("128");
    await expect
      .poll(() => readPixel(page, { x: sample.x + 41, y: sample.y - 40 }))
      .toEqual([48, 80, 128, 255]);
    expect(await page.evaluate(() => window.openlight.getState())).toEqual(
      state,
    );
  });
}
