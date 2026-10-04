import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("start from a blank canvas or the sample photo", async ({ page }) => {
  const opened = () =>
    page.evaluate(() => {
      const { documentId, file, size } = window.openlight.getState();
      return documentId && { file, size };
    });
  await page.goto("/");
  await page.getByRole("button", { name: /Blank canvas/ }).click();
  await page.getByRole("menuitem", { name: /Square/ }).click();
  await expect.poll(opened).toEqual({ file: "Untitled", size: [2048, 2048] });
  expect(await readImage(page)).toMatchObject({
    size: [2048, 2048],
    center: [255, 255, 255, 255],
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Sample photo/ }).click();
  await expect.poll(opened).toEqual({ file: "demo.jpg", size: [1400, 764] });
});
