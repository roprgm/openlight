import { readFile } from "node:fs/promises";
import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";

test("a saved scene reopens the photo with its edits and keeps editing", async ({
  page,
}) => {
  await openPhoto(page);
  // Inside the radial mask, on the light strip outside it, and the removed corner of the blue square.
  const samples = [
    [600, 400],
    [1100, 400],
    [445, 295],
  ] as const;
  await page.evaluate(() => {
    const api = window.openlight;
    api.setAdjustments({ exposure: -1 });
    const mask = api.addLayer("mask");
    api.setLayerMask(mask, {
      kind: "radial",
      center: [600, 400],
      radius: [300, 200],
      angle: 0,
      feather: 0.5,
    });
    api.setAdjustments({ exposure: 1.5 }, mask);
    api.setFill({ color: "#3060c0", blend: "soft-light" });
    api.addRemovePatch(api.addLayer("heal"), {
      mode: "paint",
      size: 40,
      feather: 0,
      flow: 1,
      points: [[445, 295, 1]],
    });
  });
  // The scene keeps the field Remove synthesized, so the reopened patch fills the same way.
  const field = () =>
    page.evaluate(() => {
      const layer = window.openlight
        .getState()
        .scene?.layers.find((layer) => layer.kind === "heal");
      const patch = layer?.kind === "heal" ? layer.patches[0] : undefined;
      return patch?.mode === "remove" ? patch.field : undefined;
    });
  await expect.poll(field).toMatchObject({ strokes: 1 });
  const saved = await field();
  const edited = await readImage(page, undefined, samples);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save scene" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("photo.openlight");

  await page.reload();
  const picker = page.locator('input[type="file"]');
  await expect(picker).toHaveAttribute("accept", /\.openlight/);
  await picker.setInputFiles({
    name: "photo.openlight",
    mimeType: "",
    buffer: await readFile(await download.path()),
  });
  const exposure = page.getByRole("textbox", { name: "Exposure", exact: true });
  await expect(exposure).toHaveValue("-1.00");
  expect(await field()).toEqual(saved);
  expect(await readImage(page, undefined, samples)).toEqual(edited);

  await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0 }));
  await expect(exposure).toHaveValue("0.00");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(exposure).toHaveValue("-1.00");
});
