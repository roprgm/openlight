import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box } from "./pointer";

test("Remove debounces stroke edits, flushes on release, exports, undoes, and cancels", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  const before = await readImage(page, undefined, [[350, 200]]);
  await page.keyboard.press("h");
  await page.keyboard.press("h");
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
        ? layer.patches[0]?.stroke.points
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
  for (let step = 1; step <= 6; step++) {
    await page.mouse.move(x + step * 20 * scale, y);
    await page.clock.runFor(80);
    expect(await patchPoints()).toHaveLength(1);
  }
  // A quiet interval previews the accumulated stroke once, without dropping intermediate points.
  await page.clock.runFor(210);
  const preview = await patchPoints();
  expect(preview?.length).toBeGreaterThanOrEqual(7);
  await page.mouse.move(x + 150 * scale, y);
  await page.clock.runFor(50);
  expect(await patchPoints()).toEqual(preview);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => window.openlight.getState().history.undoCount),
    )
    .toBe(history.undoCount + 1);
  expect((await patchPoints())?.at(-1)?.[0]).toBeCloseTo(500, 0);
  await expect(canvas.locator('[data-heal-source-handle="true"]')).toHaveCount(
    0,
  );
  const patches = await page.evaluate(() => {
    const layer = window.openlight
      .getState()
      .scene?.layers.find((layer) => layer.kind === "heal");
    return layer?.kind === "heal" ? layer.patches : [];
  });
  expect(patches).toMatchObject([{ mode: "remove", stroke: { size: 320 } }]);
  expect(patches[0]).not.toHaveProperty("offset");
  const after = await readImage(page, undefined, [[350, 200]]);
  for (const channel of after.samples?.[0].slice(0, 3) ?? [])
    expect(Math.abs(channel - 128)).toBeLessThanOrEqual(2);
  await page.keyboard.press("ControlOrMeta+z");
  const undone = await readImage(page, undefined, [[350, 200]]);
  expect(undone.samples).toEqual(before.samples);
  for (const cancel of ["Escape", "ControlOrMeta+z"]) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 100 * scale, y);
    await page.keyboard.press(cancel);
    await page.mouse.up();
    await page.clock.runFor(300);
    expect(await patchPoints()).toBeUndefined();
  }
  await page.clock.resume();
  await page.keyboard.press("h");
  await expect(
    page
      .getByRole("group", { name: "Retouch mode" })
      .getByRole("button", { name: "Heal", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Remove moves on drop and cancels a pending move on undo, pointer cancellation, and tool exit", async ({
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
  await page.keyboard.press("h");
  await page.keyboard.press("h");
  await page.keyboard.press("h");
  const size = page.getByRole("textbox", { name: "Size", exact: true });
  await size.fill("20");
  await size.press("Enter");
  const canvas = page.getByLabel("Healing canvas", { exact: true });
  const bounds = await box(canvas);
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  const handle = canvas.locator('[data-heal-destination-handle="true"]');
  await expect(handle).toBeVisible();
  const points = () =>
    page.evaluate(() => {
      const layer = window.openlight
        .getState()
        .scene?.layers.find((layer) => layer.kind === "heal");
      return layer?.kind === "heal" ? layer.patches[0]?.stroke.points : [];
    });
  const initial = await points();
  const history = await page.evaluate(
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
  expect(await points()).toEqual(initial);
  await page.mouse.up();
  await expect.poll(points).not.toEqual(initial);
  expect(
    await page.evaluate(() => window.openlight.getState().history.undoCount),
  ).toBe(history + 1);
  for (const cancel of ["undo", "pointercancel", "exit"]) {
    const { x, y } = await startMove();
    if (cancel === "undo") await page.keyboard.press("ControlOrMeta+z");
    if (cancel === "pointercancel") await handle.dispatchEvent("pointercancel");
    if (cancel === "exit") await page.keyboard.press("Escape");
    await page.mouse.move(x + 60, y + 30);
    await page.mouse.up();
    expect(await points()).toEqual(initial);
    expect(
      await page.evaluate(() => window.openlight.getState().history),
    ).toMatchObject({ undoCount: history, editing: false });
  }
});

test("Remove synthesizes a spot without donor selection and reuses only unchanged content", async ({
  page,
}) => {
  await page.goto("/tests/gpu.html");
  const result = await page.evaluate(async () => {
    const path = "/tests/inpaint-gpu.ts";
    const { renderInpaintReference } = (await import(
      path
    )) as typeof import("./inpaint-gpu");
    return renderInpaintReference("flat");
  });
  expect(result.errors).toEqual([]);
  expect(result.finite).toBe(true);
  expect(result.afterError).toBeLessThan(0.002);
  expect(result.outsideError).toBe(0);
  expect(result.alphaError).toBe(0);
  expect(result.restoredError).toBe(0);
  expect(result.visibilityError).toBe(0);
  expect(result.hiddenCaches).toBeGreaterThan(0);
  expect(result.shownSolverPasses).toBe(0);
  expect(result.solverPasses).toBeGreaterThan(0);
  expect(result.cachedSolverPasses).toBe(0);
  expect(result.changedSolverPasses).toBeGreaterThan(0);
  expect(result.releasedCaches).toBe(0);
});

for (const fixture of ["gradient", "texture", "edge"] as const) {
  test(`Remove reconstructs ${fixture} context and preserves pixels outside the stroke`, async ({
    page,
  }) => {
    await page.goto("/tests/gpu.html");
    const result = await page.evaluate(async (fixture) => {
      const path = "/tests/inpaint-gpu.ts";
      const { renderInpaintReference } = (await import(
        path
      )) as typeof import("./inpaint-gpu");
      return renderInpaintReference(fixture);
    }, fixture);
    expect(result.errors).toEqual([]);
    expect(result.finite).toBe(true);
    expect(result.afterError).toBeLessThan(0.015);
    expect(result.afterError).toBeLessThan(result.beforeError * 0.05);
    expect(result.outsideError).toBe(0);
    expect(result.alphaError).toBe(0);
  });
}

test("Remove supports a proxy and leaves an image alone when no clean donor exists", async ({
  page,
}) => {
  await page.goto("/tests/gpu.html");
  const results = await page.evaluate(async () => {
    const path = "/tests/inpaint-gpu.ts";
    const { renderInpaintReference } = (await import(
      path
    )) as typeof import("./inpaint-gpu");
    return [
      await renderInpaintReference("texture", 32, true),
      await renderInpaintReference("flat", 400),
    ];
  });
  for (const result of results) {
    expect(result.errors).toEqual([]);
    expect(result.finite).toBe(true);
    expect(result.alphaError).toBe(0);
  }
  expect(results[0].afterError).toBeLessThan(0.04);
  expect(results[1].afterError).toBe(results[1].beforeError);
});
