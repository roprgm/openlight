import { expect, test } from "./fixtures";
import { readImage, readPreview } from "./images";

function expectNear(actual: number[], expected: number[]) {
  for (const [i, value] of expected.entries()) {
    expect(Math.abs(actual[i] - value), `Channel ${i}`).toBeLessThanOrEqual(1);
  }
}

test("Bayer and JPEG XL DNG files open in color and take white balance", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  for (const name of ["bayer.dng", "linear-jxl.dng"]) {
    await test.step(name, async () => {
      await page.evaluate(
        (url) => window.openlight.loadUrl(url),
        `/tests/fixtures/raw/${name}`,
      );
      const image = await readImage(page);
      expect(image.size).toEqual([96, 128]);
      // The fixture's camera profile is sRGB with known linear samples .5, .25, .125.
      expectNear(image.center, [188, 137, 99, 255]);
      await page.evaluate(() =>
        window.openlight.setWhiteBalance({ temperature: 4000, tint: 20 }),
      );
      const cool = await readImage(page);
      // Full SDK camera calibration, including its white-point normalization.
      expectNear(cool.center, [192, 161, 166, 255]);
      await expect
        .poll(async () => (await readPreview(page)).center.slice(0, 3))
        .toEqual(cool.center.slice(0, 3));
      await page.getByRole("button", { name: "As Shot", exact: true }).click();
      expect((await readImage(page)).center).toEqual(image.center);
    });
  }
});
