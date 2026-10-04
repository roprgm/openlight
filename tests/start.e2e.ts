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
  await page.getByRole("button", { name: /Square/ }).click();
  await expect.poll(opened).toEqual({ file: "Untitled", size: [3000, 3000] });
  expect(await readImage(page)).toMatchObject({
    size: [3000, 3000],
    center: [255, 255, 255, 255],
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Sample photo/ }).click();
  await expect.poll(opened).toEqual({ file: "demo.jpg", size: [1400, 764] });
});
