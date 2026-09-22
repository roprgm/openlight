import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("a saved scene reopens the photo with its edits and keeps editing", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.locator('input[type="file"]');
  await picker.setInputFiles("tests/fixtures/photo.svg");
  const exposure = page.getByRole("textbox", { name: "Exposure", exact: true });
  await expect(exposure).toHaveValue("0.00");
  // Inside the radial mask, and on the light strip outside it.
  const samples = [
    [600, 400],
    [1100, 400],
  ] as const;
  const baseline = await readImage(page, undefined, samples);
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
    api.selectLayer(api.getState().scene?.layers[0].id ?? "");
  });
  await expect(exposure).toHaveValue("-1.00");
  const edited = await readImage(page, undefined, samples);
  const [inside, outside] = edited.samples ?? [];
  expect(outside[0]).toBeLessThan(baseline.samples?.[1][0] ?? 0);
  expect(inside).not.toEqual(outside);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("region", { name: "Scene export" })
    .getByRole("button", { name: "Save scene" })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("photo.openlight");
  const path = await download.path();
  if (!path) throw new Error("Missing scene download.");

  await page.reload();
  await expect(picker).toHaveAttribute("accept", /\.openlight/);
  await picker.setInputFiles({
    name: "photo.openlight",
    mimeType: "",
    buffer: await readFile(path),
  });
  await expect(exposure).toHaveValue("-1.00");
  await expect(page.getByText("photo.openlight")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Layers", exact: true })
      .getByText("Color"),
  ).toBeVisible();
  expect(await readImage(page, undefined, samples)).toEqual(edited);

  await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0 }));
  await expect(exposure).toHaveValue("0.00");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(exposure).toHaveValue("-1.00");
  expect(await readImage(page, undefined, samples)).toEqual(edited);
});
