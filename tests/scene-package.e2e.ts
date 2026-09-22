import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { expect, test } from "./fixtures";
import { choose } from "./pointer";

test("save a layered scene and reopen it with its original image", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("public/images/demo.jpg");
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toBeVisible();
  const original = await readFile("public/images/demo.jpg");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save editable scene" }),
  ).toBeVisible();
  await expect(page.getByText("…", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/scene-export-after.png" });
  const format = page.getByRole("combobox", { name: "Format" });
  await expect(
    page.getByRole("button", { name: "Save jpeg image" }),
  ).toBeVisible();
  await choose(page, format, "PNG");
  await expect(
    page.getByRole("button", { name: "Save png image" }),
  ).toBeVisible();
  await choose(page, format, "WebP");
  await expect(
    page.getByRole("button", { name: "Save webp image" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  const saved = await page.evaluate(() => {
    const editor = window.openlight;
    const state = editor.getState();
    if (!state.frame) throw new Error("Document frame is unavailable.");
    const fill = editor.addLayer("fill");
    editor.setFill({ color: "#ff8040" });
    editor.setLayer(fill, { opacity: 0.25 });
    const healing = editor.addLayer("heal");
    editor.addHealPatch(
      healing,
      {
        mode: "paint",
        size: 12,
        feather: 0.5,
        flow: 1,
        points: [
          [20, 20, 1],
          [22, 21, 1],
        ],
      },
      [10, 0],
    );
    editor.setFrame({ ...state.frame, rotation: 90 });
    return editor.getState().scene;
  });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save editable scene" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save editable scene" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("demo.openlight");
  const path = await download.path();
  if (!path) throw new Error("Scene download is unavailable.");
  const bytes = await readFile(path);
  const entries = unzipSync(bytes);
  const manifest = JSON.parse(
    new TextDecoder().decode(entries["manifest.json"]),
  );
  expect(manifest.format).toBe("openlight");
  expect(manifest.version).toBe(1);
  expect(manifest.scene).toEqual(saved);
  expect(Buffer.from(entries[manifest.assets[0].path])).toEqual(original);

  await page.reload();
  await page.locator('input[type="file"]').setInputFiles({
    name: "demo.openlight",
    mimeType: "application/zip",
    buffer: bytes,
  });
  await expect
    .poll(() => page.evaluate(() => window.openlight.getState().scene))
    .toEqual(saved);
  const restored = await page.evaluate(() => window.openlight.getState());
  expect(restored.history.undoCount).toBe(0);
  expect(restored.scene?.layers[1]).toMatchObject({
    kind: "fill",
    fill: { color: "#ff8040" },
  });
  expect(restored.scene?.layers[2]).toMatchObject({
    kind: "heal",
    patches: [
      {
        stroke: {
          points: [
            [20, 20, 1],
            [22, 21, 1],
          ],
        },
        offset: [10, 0],
      },
    ],
  });
});
