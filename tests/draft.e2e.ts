import type { Page } from "@playwright/test";
import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";

/** The stored draft's base exposure, read straight from IndexedDB. */
function savedExposure(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number | undefined>((resolve, reject) => {
        const opening = indexedDB.open("openlight", 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const request = database
            .transaction("draft")
            .objectStore("draft")
            .get("latest");
          request.onsuccess = () => {
            database.close();
            resolve(request.result?.scene.scene.layers[0].adjustments.exposure);
          };
        };
      }),
  );
}

test("edits survive a reload as a draft that recovers, keeps saving, and can be forgotten", async ({
  page,
}) => {
  const recover = page.getByRole("button", { name: "Recover", exact: true });
  const exposure = page.getByRole("textbox", { name: "Exposure", exact: true });
  await openPhoto(page);
  await page.evaluate(() => {
    window.openlight.setVignette({ intensity: 80 });
    window.openlight.setAdjustments({ exposure: -1 });
  });
  const edited = await readImage(page);
  await expect.poll(() => savedExposure(page)).toBe(-1);

  await page.reload();
  await recover.click();
  await expect(exposure).toHaveValue("-1.00");
  expect(await readImage(page)).toEqual(edited);
  expect(
    (await page.evaluate(() => window.openlight.getState())).history.undoCount,
  ).toBe(0);
  await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0.5 }));
  await expect.poll(() => savedExposure(page)).toBe(0.5);

  await page.reload();
  await page.getByRole("button", { name: "Forget", exact: true }).click();
  await expect(recover).toHaveCount(0);
  await expect.poll(() => savedExposure(page)).toBeUndefined();
});

test("without IndexedDB a notice suggests scene files and editing still works", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", { value: undefined }),
  );
  await openPhoto(page);
  const notice = page.getByRole("status").filter({ hasText: "Drafts" });
  await expect(notice).toContainText("Save a scene from Export");
  await page.evaluate(() => window.openlight.setAdjustments({ exposure: 1 }));
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("1.00");
  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toHaveCount(0);
});
