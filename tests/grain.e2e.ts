import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** The exported image's red channel, row by row; grain keeps a gray image gray. */
async function exportRed(page: Page) {
  return page.evaluate(async () => {
    const image = await createImageBitmap(await window.openlight.exportImage());
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot read image pixels.");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    return Array.from(data.filter((_, index) => index % 4 === 0));
  });
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deviation(values: readonly number[]) {
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
}

function correlation(a: readonly number[], b: readonly number[]) {
  const [ma, mb] = [mean(a), mean(b)];
  const covariance = mean(
    a.map((value, index) => (value - ma) * (b[index] - mb)),
  );
  return covariance / (deviation(a) * deviation(b));
}

test("grain textures a gray image without shifting its tone, holds through a crop, and undoes", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "gray.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128"><rect width="256" height="128" fill="#808080"/></svg>',
    ),
  });
  await page.getByRole("button", { name: "Add effect", exact: true }).click();
  await page.getByRole("menuitem", { name: "Grain", exact: true }).click();
  const amount = page.getByRole("textbox", { name: "Amount", exact: true });
  await expect(amount).toHaveValue("25");
  await expect(
    page.getByRole("textbox", { name: "Size", exact: true }),
  ).toHaveValue("25");
  await expect(
    page.getByRole("textbox", { name: "Roughness", exact: true }),
  ).toHaveValue("50");

  const light = await exportRed(page);
  expect(deviation(light)).toBeGreaterThan(2);
  expect(Math.abs(mean(light) - 128)).toBeLessThan(1);

  await amount.fill("100");
  await amount.press("Enter");
  const heavy = await exportRed(page);
  expect(deviation(heavy)).toBeGreaterThan(3 * deviation(light));
  expect(Math.abs(mean(heavy) - 128)).toBeLessThan(1);
  expect(await exportRed(page)).toEqual(heavy);

  // A little more size fades coarser grain in over the same particles rather than stretching them.
  const size = page.getByRole("textbox", { name: "Size", exact: true });
  await size.fill("30");
  await size.press("Enter");
  expect(correlation(await exportRed(page), heavy)).toBeGreaterThan(0.9);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await exportRed(page)).toEqual(heavy);

  // A centered square crop of the 256 × 128 image keeps source columns 64 to 191.
  await page.evaluate(() =>
    window.openlight.run({ type: "set-crop", aspectRatio: 1 }),
  );
  expect(await exportRed(page)).toEqual(
    heavy.filter((_, index) => index % 256 >= 64 && index % 256 < 192),
  );

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.click();
  await undo.click();
  expect(await exportRed(page)).toEqual(light);

  await amount.fill("0");
  await amount.press("Enter");
  expect(deviation(await exportRed(page))).toBe(0);
});
