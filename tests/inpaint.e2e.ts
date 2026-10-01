import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box } from "./pointer";

test("H cycles to Remove, paints without a donor, exports, and undoes", async ({
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
  await page.mouse.click(
    bounds.x + bounds.width / 2 - 250 * scale,
    bounds.y + bounds.height / 2 - 200 * scale,
  );
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
  await page.keyboard.press("h");
  await expect(
    page
      .getByRole("group", { name: "Retouch mode" })
      .getByRole("button", { name: "Heal", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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
