import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

/** The stored draft's base exposure and source keys, read straight from IndexedDB. */
function storedDraft(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ exposure: number; sources: IDBValidKey[] } | null>(
        (resolve, reject) => {
          const opening = indexedDB.open("openlight", 1);
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const database = opening.result;
            const transaction = database.transaction(["draft", "sources"]);
            const record = transaction.objectStore("draft").get("latest");
            const sources = transaction.objectStore("sources").getAllKeys();
            transaction.oncomplete = () => {
              database.close();
              resolve(
                record.result
                  ? {
                      exposure:
                        record.result.scene.scene.layers[0].adjustments
                          .exposure,
                      sources: sources.result,
                    }
                  : null,
              );
            };
          };
        },
      ),
  );
}

test("edits survive a reload as a draft that recovers, keeps editing, and can be forgotten", async ({
  page,
}) => {
  await page.goto("/");
  const recover = page.getByRole("button", { name: "Recover", exact: true });
  const forget = page.getByRole("button", { name: "Forget", exact: true });
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  const exposure = page.getByRole("textbox", { name: "Exposure", exact: true });
  await expect(exposure).toHaveValue("0.00");
  await expect(recover).toHaveCount(0);
  expect(await storedDraft(page)).toBeNull();

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
    api.selectLayer(api.getState().scene?.layers[0].id ?? "");
  });
  await expect(exposure).toHaveValue("-1.00");
  const samples = [
    [600, 400],
    [1100, 400],
  ] as const;
  const edited = await readImage(page, undefined, samples);
  await expect.poll(() => storedDraft(page)).toMatchObject({ exposure: -1 });
  const { sources } = (await storedDraft(page)) ?? { sources: [] };
  expect(sources).toHaveLength(1);

  await page.reload();
  await expect(recover).toBeVisible();
  await expect(forget).toBeVisible();
  await recover.click();
  await expect(exposure).toHaveValue("-1.00");
  expect(await readImage(page, undefined, samples)).toEqual(edited);
  expect(
    (await page.evaluate(() => window.openlight.getState())).history.undoCount,
  ).toBe(0);

  await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0.5 }));
  await expect(exposure).toHaveValue("0.50");
  // The recovered source keeps its ID, so the save reuses the stored file.
  await expect
    .poll(() => storedDraft(page))
    .toEqual({ exposure: 0.5, sources });

  await page.reload();
  await forget.click();
  await expect(recover).toHaveCount(0);
  expect(await storedDraft(page)).toBeNull();
  await page.reload();
  await expect(page.getByText("choose a file")).toBeVisible();
  await expect(recover).toHaveCount(0);
});

test("without IndexedDB a notice suggests scene files and editing still works", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", { value: undefined }),
  );
  await page.goto("/");
  const notice = page.getByRole("status").filter({ hasText: "Drafts" });
  await expect(notice).toContainText("Save a scene from Export");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await page.evaluate(() => window.openlight.setAdjustments({ exposure: 1 }));
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("1.00");
  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toHaveCount(0);
  // The autosave after that edit fails the same way without bringing the notice back.
  await page.waitForTimeout(2000);
  await expect(notice).toHaveCount(0);
  await expect(
    page.evaluate(() => window.openlight.recoverDraft()),
  ).rejects.toThrow("IndexedDB is unavailable.");
});
