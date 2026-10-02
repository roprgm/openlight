import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box } from "./pointer";

for (const mode of ["Remove", "Heal", "Clone"]) {
  test(`${mode} adds and subtracts separate strokes on the selected patch, on release`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page
      .locator('input[type="file"]')
      .setInputFiles("tests/fixtures/spots.svg");
    await expect(
      page.getByRole("textbox", { name: "Exposure", exact: true }),
    ).toHaveValue("0.00");
    await page.keyboard.press("h");
    await page
      .getByRole("group", { name: "Retouch mode" })
      .getByRole("button", { name: mode, exact: true })
      .click();
    const canvas = page.getByLabel("Healing canvas", { exact: true });
    const bounds = await box(canvas);
    const scale = Math.min(
      (bounds.width - 48) / 1200,
      (bounds.height - 48) / 800,
      2,
    );
    const point = (x: number, y: number) =>
      [
        bounds.x + bounds.width / 2 + (x - 600) * scale,
        bounds.y + bounds.height / 2 + (y - 400) * scale,
      ] as const;
    const size = page.getByRole("textbox", { name: "Size", exact: true });
    await size.fill("80");
    await size.press("Enter");
    const feather = page.getByRole("textbox", { name: "Feather", exact: true });
    await feather.fill("0");
    await feather.press("Enter");
    const samples = [
      [350, 160],
      [350, 260],
      [350, 210],
    ] as const;
    const before = await readImage(page, undefined, samples);
    if (mode !== "Remove") {
      await page.keyboard.down("Alt");
      await page.mouse.click(...point(350, 560));
      await page.keyboard.up("Alt");
    }
    await page.mouse.click(...point(350, 160));
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { history } = window.openlight.getState();
          return "editing" in history && history.editing;
        }),
      )
      .toBe(false);
    const patches = () =>
      page.evaluate(() => {
        const layer = window.openlight
          .getState()
          .scene?.layers.find((layer) => layer.kind === "heal");
        return layer?.kind === "heal" ? layer.patches : [];
      });
    const original = (await patches())[0];
    const layerId = await page.evaluate(
      () => window.openlight.getState().selectedLayerId,
    );
    if (!layerId) throw Error("Healing layer missing.");
    const undoCount = await page.evaluate(
      () => window.openlight.getState().history.undoCount,
    );
    await page.keyboard.down("Shift");
    await page.mouse.move(...point(350, 260));
    await page.mouse.down();
    await page.mouse.move(...point(355, 260));
    const preview = canvas.locator('[data-heal-stroke-preview="true"]');
    await expect(preview).toBeVisible();
    // Feather shortcuts must not discard a modifier stroke that is still being drawn.
    await page.keyboard.press("BracketRight");
    await expect(preview).toBeVisible();
    await page.keyboard.press("BracketLeft");
    await expect(feather).toHaveValue("0");
    expect(await patches()).toEqual([original]);
    expect(
      await page.evaluate(() => window.openlight.getState().history.undoCount),
    ).toBe(undoCount);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect(preview).toHaveCount(0);
    const added = (await patches())[0];
    expect(await patches()).toHaveLength(1);
    expect(added).toMatchObject({
      id: original.id,
      mode: original.mode,
      strokes: [{ mode: "paint" }, { mode: "paint" }],
    });
    if (original.mode !== "remove")
      expect(added).toHaveProperty("offset", original.offset);
    expect(
      await page.evaluate(() => window.openlight.getState().history.undoCount),
    ).toBe(undoCount + 1);
    const repaired = await readImage(page, undefined, samples);
    for (const index of [0, 1]) {
      for (const channel of repaired.samples?.[index].slice(0, 3) ?? [])
        expect(Math.abs(channel - 128)).toBeLessThanOrEqual(4);
    }
    // Separate strokes never draw a connecting segment through the uncovered gap.
    expect(repaired.samples?.[2]).toEqual(before.samples?.[2]);
    await size.fill("20");
    await size.press("Enter");
    await page.keyboard.down("Alt");
    // A modifier over the anchor paints instead of starting a destination drag.
    await page.mouse.move(...point(350, 260));
    await page.mouse.down();
    await page.mouse.move(...point(355, 260));
    await expect(preview).toBeVisible();
    expect((await patches())[0]).toEqual(added);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    expect(await patches()).toMatchObject([
      {
        id: original.id,
        strokes: [{ mode: "paint" }, { mode: "paint" }, { mode: "erase" }],
      },
    ]);
    const erased = await readImage(page, undefined, samples);
    expect(erased.samples?.[1]).toEqual(before.samples?.[1]);
    expect(erased.samples?.[0]).toEqual(repaired.samples?.[0]);
    await page.keyboard.press("ControlOrMeta+z");
    expect((await patches())[0]).toEqual(added);
    expect((await readImage(page, undefined, samples)).samples).toEqual(
      repaired.samples,
    );
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect((await readImage(page, undefined, samples)).samples).toEqual(
      erased.samples,
    );
    for (const cancel of ["Escape", "pointercancel", "b"]) {
      await page
        .getByRole("button", { name: "Select patch 1", exact: true })
        .click();
      await page.keyboard.down("Shift");
      await page.mouse.move(...point(350, 210));
      await page.mouse.down();
      await expect(preview).toBeVisible();
      if (cancel === "pointercancel")
        await canvas.dispatchEvent("pointercancel", { pointerId: 1 });
      else await page.keyboard.press(cancel);
      await page.mouse.up();
      await page.keyboard.up("Shift");
      expect((await patches())[0].strokes).toHaveLength(3);
      if (cancel === "b") {
        await page.keyboard.press("h");
        await page.evaluate((id) => window.openlight.selectLayer(id), layerId);
      }
    }
    await page.mouse.click(...point(800, 500));
    await expect.poll(async () => (await patches()).length).toBe(2);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { history } = window.openlight.getState();
          return "editing" in history && history.editing;
        }),
      )
      .toBe(false);
    // Editing a selected earlier patch does not append to the last one.
    await page
      .getByRole("button", { name: "Select patch 1", exact: true })
      .click();
    await page.keyboard.down("Shift");
    await page.mouse.click(...point(390, 260));
    await page.keyboard.up("Shift");
    expect((await patches()).map((patch) => patch.strokes.length)).toEqual([
      4, 1,
    ]);
    await page
      .getByRole("button", { name: "Select patch 2", exact: true })
      .click();
    await page.mouse.click(...point(350, 260));
    // Erased holes do not intercept clicks with the earlier painted footprint.
    await expect.poll(async () => (await patches()).length).toBe(3);
  });
}
