import { readFile } from "node:fs/promises";
import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";

test("settings copied from one photo paste on another as one edit, and a saved preset applies after a reload", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  const menu = page.getByRole("button", { name: "Copy settings and presets" });
  const item = (name: string) =>
    page.getByRole("menuitem", { name, exact: true });
  const exposure = page.getByRole("textbox", { name: "Exposure", exact: true });
  await openPhoto(page);

  await test.step("copy the chosen settings, leaving white balance", async () => {
    await page.evaluate(() => {
      const api = window.openlight;
      api.setAdjustments({ exposure: -1, contrast: 30, vibrance: 40 });
      api.setAdjustments({ incrementalTemperature: 25 });
      api.setVignette({ intensity: 60 });
    });
    await menu.click();
    await expect(item("Paste settings")).toBeDisabled();
    await item("Copy settings…").click();
    const dialog = page.getByRole("dialog", { name: "Copy settings" });
    await expect(
      dialog.getByRole("checkbox", { name: "White balance" }),
    ).not.toBeChecked();
    await dialog.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step("paste them on another photo as one edit that keeps its mask", async () => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open an image or scene" }).click();
    await (await chooser).setFiles("tests/fixtures/tones.png");
    await expect.poll(async () => (await state()).file).toBe("tones.png");
    await page.evaluate(() =>
      window.openlight.run({
        type: "add-mask",
        mask: { kind: "linear", start: [0, 0], end: [20, 0] },
        adjustments: { exposure: 1 },
      }),
    );
    const before = await state();
    await menu.click();
    await item("Paste settings").click();
    await expect
      .poll(async () => (await state()).adjustments.exposure)
      .toBe(-1);
    const after = await state();
    expect(after.adjustments).toEqual({
      ...before.adjustments,
      exposure: -1,
      contrast: 30,
      vibrance: 40,
    });
    expect(after.vignette.intensity).toBe(60);
    // The mask stays as it was, and selected, so its own Exposure still shows.
    expect(after.scene?.layers.slice(1, -1)).toEqual(
      before.scene?.layers.slice(1),
    );
    expect(after.selectedLayerId).toBe(before.selectedLayerId);
    await expect(exposure).toHaveValue("1.00");
    expect(after.history.undoCount).toBe(before.history.undoCount + 1);
    const pasted = await readImage(page);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await state()).scene).toEqual(before.scene);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page
      .getByRole("button", { name: "Select tones.png", exact: true })
      .click();
    await expect(exposure).toHaveValue("-1.00");

    // The same photo edited by hand exports the same pixels.
    await page.evaluate(() => {
      const api = window.openlight;
      api.undo();
      api.setAdjustments({ exposure: -1, contrast: 30, vibrance: 40 });
      api.setVignette({ intensity: 60 });
    });
    expect(await readImage(page)).toEqual(pasted);
  });

  await test.step("keys in a preset dialog stay there, even over Crop", async () => {
    const { history } = await state();
    const crop = page.getByRole("region", { name: "Crop tool" });
    await page.getByRole("tab", { name: "Crop" }).click();
    await expect(crop).toBeVisible();
    const dialog = page.getByRole("dialog", { name: "Save preset" });
    await menu.click();
    await item("Save preset…").click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(crop).toBeVisible();

    await menu.click();
    await item("Save preset…").click();
    await dialog.getByRole("checkbox", { name: "Light" }).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await dialog.getByRole("textbox", { name: "Name" }).fill("Moody");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(crop).toBeVisible();
    expect((await state()).history).toEqual(history);
    // Focus returns to the menu's button, whose tooltip takes the next Escape, as any button's does.
    await expect(menu).toBeFocused();
    await page
      .getByRole("group", { name: "Crop" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(crop).toBeHidden();
  });

  await test.step("after a reload the preset exports, imports again, and applies; a malformed file changes nothing", async () => {
    await page.reload();
    await openPhoto(page);
    const opened = await state();
    await menu.click();
    await item("Manage presets…").click();
    const manage = page.getByRole("dialog", { name: "Presets" });
    const rows = manage.getByRole("listitem");
    await expect(rows).toHaveText([/^Moody/]);
    const downloading = page.waitForEvent("download");
    await manage.getByRole("button", { name: "Export Moody" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("Moody.openlight-preset");
    await manage.getByRole("button", { name: "Delete Moody" }).click();
    await expect(rows).toHaveCount(0);

    async function importPreset(name: string, buffer: Buffer) {
      const chooser = page.waitForEvent("filechooser");
      await manage.getByRole("button", { name: "Import…" }).click();
      await (await chooser).setFiles({ name, mimeType: "", buffer });
    }
    await importPreset(
      "newer.openlight-preset",
      Buffer.from(
        JSON.stringify({
          format: "openlight-preset",
          version: 2,
          name: "Newer",
          settings: {},
        }),
      ),
    );
    await expect(manage.getByRole("alert")).toContainText(
      "needs a newer version",
    );
    await importPreset(
      "Moody.openlight-preset",
      await readFile(await download.path()),
    );
    await expect(rows).toHaveText([/^Moody/]);
    await manage.getByRole("button", { name: "Done", exact: true }).click();
    expect(await state()).toEqual(opened);

    await menu.click();
    await item("Apply preset").click();
    await item("Moody").click();
    await expect(exposure).toHaveValue("-1.00");
    expect((await state()).history.undoCount).toBe(1);
  });
});
