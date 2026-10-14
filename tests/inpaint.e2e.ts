import { expect, expectNear, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box } from "./pointer";

test("Remove previews each frame, solves on release, exports, undoes, cancels, and moves on drop", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPhoto(page);
  const before = await readImage(page, undefined, [[350, 200]]);
  await page.keyboard.press("h");
  const remove = page
    .getByRole("group", { name: "Retouch mode" })
    .getByRole("button", { name: "Remove", exact: true });
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  const size = page.getByRole("textbox", { name: "Size", exact: true });
  await size.fill("320");
  await size.press("Enter");
  const feather = page.getByRole("textbox", { name: "Feather", exact: true });
  await feather.fill("0");
  await feather.press("Enter");
  const canvas = page.getByLabel("Healing canvas", { exact: true });
  const bounds = await box(canvas);
  const scale = Math.min(
    (bounds.width - 48) / 1200,
    (bounds.height - 48) / 800,
    2,
  );
  const x = bounds.x + bounds.width / 2 - 250 * scale;
  const y = bounds.y + bounds.height / 2 - 200 * scale;
  const patchPoints = () =>
    page.evaluate(() => {
      const layer = window.openlight
        .getState()
        .scene?.layers.find((layer) => layer.kind === "heal");
      return layer?.kind === "heal"
        ? layer.patches[0]?.strokes[0].points
        : undefined;
    });
  const history = await page.evaluate(
    () => window.openlight.getState().history,
  );
  const time = new Date();
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.mouse.move(x, y);
  await page.mouse.down();
  const preview = canvas.locator('[data-heal-stroke-preview="true"]');
  await expect(preview).toBeVisible();
  // The outline follows the stroke each frame, before anything is edited.
  const path = preview.locator("path").first();
  let width = (await box(path)).width;
  for (let step = 1; step <= 6; step++) {
    await page.mouse.move(x + step * 20 * scale, y);
    await page.clock.runFor(17);
    const grown = (await box(path)).width;
    expect(grown).toBeGreaterThan(width);
    width = grown;
    expect(await patchPoints()).toBeUndefined();
  }
  // Pausing while held never creates an edit or runs synthesis.
  await page.clock.runFor(500);
  expect(await patchPoints()).toBeUndefined();
  expect(
    await page.evaluate(() => window.openlight.getState().history),
  ).toEqual(history);
  expectNear(
    (await readImage(page, undefined, [[350, 200]])).samples?.[0],
    before.samples?.[0] ?? [],
    1,
  );
  await page.mouse.move(x + 150 * scale, y);
  // Release also includes points queued since the last animation frame.
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.openlight.getState().history.undoCount),
    )
    .toBe(history.undoCount + 1);
  const points = (await patchPoints()) ?? [];
  expect(Math.abs((points.at(-1)?.[0] ?? Number.NaN) - 500)).toBeLessThan(1);
  expect(points.length).toBeGreaterThanOrEqual(8);
  await expect(canvas.locator('[data-heal-source-handle="true"]')).toHaveCount(
    0,
  );
  const patches = await page.evaluate(() => {
    const layer = window.openlight
      .getState()
      .scene?.layers.find((layer) => layer.kind === "heal");
    return layer?.kind === "heal" ? layer.patches : [];
  });
  expect(patches).toMatchObject([
    { mode: "remove", strokes: [{ size: expect.closeTo(320 / scale, 6) }] },
  ]);
  expect(patches[0]).not.toHaveProperty("offset");
  // The dark spot fills with the gray around it in the export.
  const after = await readImage(page, undefined, [[350, 200]]);
  expectNear(after.samples?.[0].slice(0, 3), [128, 128, 128], 6);
  await page.keyboard.press("ControlOrMeta+z");
  const undone = await readImage(page, undefined, [[350, 200]]);
  expectNear(undone.samples?.[0], before.samples?.[0] ?? [], 1);
  // A brush crossing the viewport edge keeps its outline's raster edge outside the viewport.
  await page.mouse.move(bounds.x + 30, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.clock.runFor(17);
  const region = await preview
    .locator('[data-heal-outline="destination"] filter')
    .getAttribute("x");
  expect(Number(region)).toBeLessThan(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  for (const cancel of ["Escape", "pointercancel", "exit", "ControlOrMeta+z"]) {
    if (!(await canvas.isVisible())) await page.keyboard.press("h");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 100 * scale, y);
    if (cancel === "pointercancel")
      await canvas.dispatchEvent("pointercancel", { pointerId: 1 });
    else if (cancel === "exit") await page.keyboard.press("b");
    else await page.keyboard.press(cancel);
    await page.mouse.up();
    await page.clock.runFor(300);
    expect(await patchPoints()).toBeUndefined();
    await expect(preview).toHaveCount(0);
  }
  await page.clock.resume();

  // A patch moves on drop, and undo, pointer cancellation, or tool exit cancel a pending move.
  // Undo has emptied the history, closing the tool with its Healing layer.
  await page.keyboard.press("h");
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await size.fill("20");
  await size.press("Enter");
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  const handle = canvas.locator('[data-heal-destination-handle="true"]');
  await expect(handle).toBeVisible();
  const initial = await patchPoints();
  const moved = await page.evaluate(
    () => window.openlight.getState().history.undoCount,
  );
  async function startMove() {
    const bounds = await box(handle);
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 20, { steps: 4 });
    await expect
      .poll(async () => (await box(handle)).x)
      .toBeGreaterThan(bounds.x + 30);
    return { x, y };
  }
  await startMove();
  expect(await patchPoints()).toEqual(initial);
  expect(
    await page.evaluate(() => window.openlight.getState().history),
  ).toMatchObject({ editing: false });
  await page.mouse.up();
  await expect.poll(patchPoints).not.toEqual(initial);
  expect(
    await page.evaluate(() => window.openlight.getState().history.undoCount),
  ).toBe(moved + 1);
  for (const cancel of ["undo", "pointercancel", "exit"]) {
    const { x, y } = await startMove();
    if (cancel === "undo") await page.keyboard.press("ControlOrMeta+z");
    if (cancel === "pointercancel") await handle.dispatchEvent("pointercancel");
    if (cancel === "exit") await page.keyboard.press("Escape");
    await page.mouse.move(x + 60, y + 30);
    await page.mouse.up();
    expect(await patchPoints()).toEqual(initial);
    expect(
      await page.evaluate(() => window.openlight.getState().history),
    ).toMatchObject({ undoCount: moved, editing: false });
  }
});

test("Remove reconstructs flat, gradient, texture, and edge context, at full size and as a proxy, and follows the layers below", async ({
  page,
}) => {
  await page.goto("/tests/gpu.html");
  const results = await page.evaluate(async () => {
    const path = "/tests/inpaint-gpu.ts";
    const { renderInpaintReference } = (await import(
      path
    )) as typeof import("./inpaint-gpu");
    return {
      flat: await renderInpaintReference("flat"),
      gradient: await renderInpaintReference("gradient"),
      texture: await renderInpaintReference("texture"),
      edge: await renderInpaintReference("edge"),
      proxy: await renderInpaintReference("texture", 32, true),
      // A spot larger than the image leaves no clean donor.
      noDonor: await renderInpaintReference("flat", 400),
    };
  });
  for (const [name, result] of Object.entries(results)) {
    await test.step(name, () => {
      expect(result.errors).toEqual([]);
      expect(result.finite).toBe(true);
      expect(result.alphaError).toBeLessThan(0.001);
      expect(result.outsideError).toBeLessThan(0.001);
    });
  }
  expect(results.flat.afterError).toBeLessThan(0.01);
  for (const fixture of ["gradient", "texture", "edge"] as const) {
    const { afterError, beforeError } = results[fixture];
    expect(afterError, fixture).toBeLessThan(0.015);
    expect(afterError, fixture).toBeLessThan(beforeError * 0.05);
  }
  expect(results.proxy.afterError).toBeLessThan(0.04);
  expect(
    Math.abs(results.noDonor.afterError - results.noDonor.beforeError),
  ).toBeLessThan(0.001);
  // The fill keeps its donors, whose colors follow exposure below, and returns with it.
  expect(results.flat.exposedError).toBeLessThan(0.01);
  expect(results.flat.restoredError).toBeLessThan(0.002);
});

test("Remove synthesizes the whole patch again when a stroke adds to or erases part of it", async ({
  page,
}) => {
  await page.goto("/tests/gpu.html");
  const result = await page.evaluate(async () => {
    const path = "/tests/inpaint-gpu.ts";
    const { renderInpaintReshape } = (await import(
      path
    )) as typeof import("./inpaint-gpu");
    return renderInpaintReshape();
  });
  expect(result.errors).toEqual([]);
  // The first stroke stops short of the bar's tip, which stays dark.
  expect(result.missedTip).toBeLessThan(0.05);
  // A stroke over the tip leaves nothing of the bar, nor does erasing part of the patch, which
  // restores what it erases.
  expect(result.barLeft).toBeGreaterThan(0.25);
  expect(result.barLeftErased).toBeGreaterThan(0.25);
  expect(result.erasedRestored).toBeLessThan(0.001);
});
