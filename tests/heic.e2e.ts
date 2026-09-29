import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("a HEIC image opens with its size and pixels", async ({ page }) => {
  await page.goto("/");
  const supported = await page.evaluate(
    async () =>
      "VideoDecoder" in window &&
      // Main Still Picture profile used by patches.heic.
      (await VideoDecoder.isConfigSupported({ codec: "hvc1.3.e.L30" }))
        .supported,
  );
  test.skip(!supported, "This browser has no HEVC Main Still Picture decoder.");
  await page.waitForFunction(() => window.openlight);
  await page.evaluate(() =>
    window.openlight.loadUrl("/tests/fixtures/patches.heic"),
  );
  const { size, samples } = await readImage(page, undefined, [
    [16, 16],
    [48, 16],
    [16, 48],
    [48, 48],
  ]);
  expect(size).toEqual([64, 64]);
  // Reference pixels decoded independently with libheif.
  const expected = [
    176, 96, 95, 255, 97, 176, 97, 255, 94, 95, 175, 255, 128, 128, 128, 255,
  ];
  samples?.flat().forEach((value, i) => {
    expect(Math.abs(value - expected[i]), `Channel ${i}`).toBeLessThanOrEqual(
      3,
    );
  });
});
