import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

type Dropped = { name: string; type: string; text: string };

function drop(page: Page, files: Dropped[]) {
  return page.evaluate((files) => {
    const transfer = new DataTransfer();
    for (const { name, type, text } of files) {
      transfer.items.add(new File([text], name, { type }));
    }
    document.dispatchEvent(
      new DragEvent("drop", { dataTransfer: transfer, cancelable: true }),
    );
  }, files);
}

test("saved settings restore the edits when dropped with the photo later, as one undo step", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
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
    .getByRole("region", { name: "Settings export" })
    .getByRole("button", { name: "Save settings" })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("photo.openlight");
  const path = await download.path();
  if (!path) throw new Error("Missing settings download.");
  const settings = {
    name: "photo.openlight",
    type: "",
    text: await readFile(path, "utf8"),
  };
  expect(JSON.parse(settings.text)).toMatchObject({
    format: "openlight",
    image: { name: "photo.svg", size: [1200, 800] },
  });

  await page.reload();
  await page.waitForFunction(() => window.openlight);
  const photo = {
    name: "photo.svg",
    type: "image/svg+xml",
    text: await readFile("tests/fixtures/photo.svg", "utf8"),
  };
  await drop(page, [settings, photo]);
  await expect(exposure).toHaveValue("-1.00");
  expect(await readImage(page, undefined, samples)).toEqual(edited);
  await expect(
    page
      .getByRole("region", { name: "Layers", exact: true })
      .getByText("Color"),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => window.openlight.getState())).history.undoCount,
  ).toBe(1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(exposure).toHaveValue("0.00");
  expect(await readImage(page, undefined, samples)).toEqual(baseline);
  await drop(page, [settings]);
  await expect(exposure).toHaveValue("-1.00");
  expect(await readImage(page, undefined, samples)).toEqual(edited);
});
