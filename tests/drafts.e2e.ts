import { expect, test } from "./fixtures";
import { readImage } from "./images";

async function storedExposure(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("openlight-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number | undefined>((resolve, reject) => {
        const request = database
          .transaction("draft")
          .objectStore("draft")
          .get("latest");
        request.onsuccess = () =>
          resolve(request.result?.scene?.layers?.[0]?.adjustments?.exposure);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

test("an edited scene survives reload and can be recovered or forgotten", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Recover" })).toHaveCount(0);
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  const saved = await page.evaluate(() => {
    window.openlight.setAdjustments({ exposure: 1.5 });
    const mask = window.openlight.addLayer("mask");
    window.openlight.setLayer(mask, { opacity: 0.6 });
    return window.openlight.getState().scene;
  });
  const pixels = await readImage(page);
  await expect.poll(() => storedExposure(page)).toBe(1.5);

  await page.reload();
  await expect(page.getByText("Previous edit: photo.svg.")).toBeVisible();
  await page.screenshot({ path: "test-results/draft-recovery.png" });
  await page.getByRole("button", { name: "Recover" }).click();
  await expect
    .poll(() => page.evaluate(() => window.openlight.getState().scene))
    .toEqual(saved);
  expect(await readImage(page)).toEqual(pixels);

  await page.evaluate(() => window.openlight.setAdjustments({ exposure: 2 }));
  await expect.poll(() => storedExposure(page)).toBe(2);
  await page.reload();
  await page.getByRole("button", { name: "Recover" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.openlight.getState().adjustments.exposure),
    )
    .toBe(2);

  await page.reload();
  await expect(page.getByRole("button", { name: "Recover" })).toBeVisible();
  await page.getByRole("button", { name: "Forget" }).click();
  await expect(page.getByRole("button", { name: "Recover" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Recover" })).toHaveCount(0);
});
