import type { Page } from "@playwright/test";
import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box } from "./pointer";

/** Waits for pending donor searches, then returns the selected Healing layer and its patches. */
async function healing(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { history } = window.openlight.getState();
        return "editing" in history && history.editing;
      }),
    )
    .toBe(false);
  return page.evaluate(() => {
    const { scene, selectedLayerId } = window.openlight.getState();
    const layer = scene?.layers
      .flatMap((layer) => [layer, ...layer.children])
      .find((layer) => layer.id === selectedLayerId);
    if (layer?.kind !== "heal") throw Error("Healing layer missing");
    return layer;
  });
}

test("healing preserves an edge, alpha, and HDR texture at full and proxy resolution", async ({
  page,
}) => {
  await page.goto("/tests/gpu.html");
  const { results, errors } = await page.evaluate(async () => {
    const path = "/tests/heal-gpu.ts";
    const { renderHealReference } = (await import(
      path
    )) as typeof import("./heal-gpu");
    return renderHealReference();
  });
  expect(errors).toEqual([]);
  for (const { actual, expected } of results) {
    for (const [channel, value] of expected.entries()) {
      expect(Math.abs(actual[channel] - value)).toBeLessThan(0.015);
    }
  }
});

test("Healing repairs a spot, follows its moved source, and edits patches", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPhoto(page);
  await page.keyboard.press("h");
  const size = page.getByRole("textbox", { name: "Size", exact: true });
  await size.fill("300");
  await size.press("Enter");
  const bounds = await box(page.getByLabel("Healing canvas", { exact: true }));
  const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
  const screen = (x: number, y: number): [number, number] => [
    bounds.x + bounds.width / 2 + (x - 600) * scale,
    bounds.y + bounds.height / 2 + (y - 400) * scale,
  ];
  await page.mouse.click(...screen(350, 200));
  await healing(page);
  const repaired = await readImage(page, undefined, [
    [350, 200],
    [510, 200],
    [600, 400],
  ]);
  for (const channel of repaired.samples?.[0].slice(0, 3) ?? []) {
    expect(Math.abs(channel - 128)).toBeLessThanOrEqual(5);
  }
  expect(repaired.samples?.slice(1)).toEqual([
    [128, 128, 128, 255],
    [128, 128, 128, 255],
  ]);

  // A donor across the dark strip's edge carries that edge into the patch.
  await page.locator('[data-heal-source-handle="true"]').hover();
  await page.mouse.down();
  await page.mouse.move(...screen(200, 560), { steps: 4 });
  await page.mouse.up();
  const [dark, light] =
    (
      await readImage(page, undefined, [
        [330, 200],
        [370, 200],
      ])
    ).samples ?? [];
  expect(light[0] - dark[0]).toBeGreaterThan(40);

  // A patch's actions duplicate and delete it, each as one undo step.
  const moved = await healing(page);
  const actions = page.getByRole("button", { name: "Patch actions" });
  await actions.click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(actions).toHaveCount(2);
  await actions.first().click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(actions).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await healing(page)).toEqual(moved);
});

test("Healing takes the first stroke after H, an Alt-click donor, and donors inside a mask", async ({
  page,
}) => {
  await openPhoto(page);
  const bounds = await box(page.getByRole("region", { name: "Image canvas" }));
  const at = (x: number, y: number): [number, number] => [
    bounds.x + bounds.width * x,
    bounds.y + bounds.height * y,
  ];
  await page.keyboard.press("h");
  await page.mouse.click(...at(0.3, 0.4));
  expect((await healing(page)).patches).toHaveLength(1);

  await page.keyboard.down("Alt");
  await page.mouse.click(...at(0.6, 0.7));
  await page.keyboard.up("Alt");
  await page.mouse.click(...at(0.7, 0.4));
  const [, manual] = (await healing(page)).patches;
  expect(manual.offset[0] / manual.offset[1]).toBeCloseTo(
    (-0.1 * bounds.width) / (0.3 * bounds.height),
  );

  await page.keyboard.press("Enter");
  const nested = await page.evaluate(() => {
    const api = window.openlight;
    const mask = api.addLayer("mask");
    api.setLayerMask(mask, {
      kind: "radial",
      center: [600, 400],
      radius: [2000, 2000],
      angle: 0,
      feather: 0,
    });
    const heal = api.addLayer("heal", { inside: mask });
    api.selectLayer(heal);
    return heal;
  });
  await page.keyboard.press("h");
  await page.mouse.click(...at(0.3, 0.4));
  const { id, patches } = await healing(page);
  expect(id).toBe(nested);
  expect(patches).toHaveLength(1);
  expect(patches[0].offset).not.toEqual([0, 0]);
});
