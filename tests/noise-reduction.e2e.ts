import { expect, test } from "./fixtures";
import { readImage } from "./images";

/** A grid of points inside a `width` × `height` image, clear of its edges. */
function grid(width: number, height: number) {
  return Array.from(
    { length: 48 },
    (_, i) =>
      [
        Math.round(((i % 6) + 1) * (width / 7)),
        Math.round((Math.floor(i / 6) + 1) * (height / 9)),
      ] as const,
  );
}

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const deviation = (values: number[]) =>
  Math.sqrt(mean(values.map((value) => (value - mean(values)) ** 2)));

/** Light, the channels' mean, and color, red less blue, across samples of a flat photo. */
function measure(samples: number[][]) {
  const light = samples.map(([r, g, b]) => (r + g + b) / 3);
  const color = samples.map(([r, , b]) => r - b);
  return {
    light: mean(light),
    lightNoise: deviation(light),
    colorNoise: deviation(color),
  };
}

test("Noise reduction cleans a noisy RAW before demosaicing and returns it as decoded at 0", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  await page.evaluate(
    (url) => window.openlight.loadUrl(url),
    "/tests/fixtures/raw/noisy-bayer.dng",
  );
  await expect(
    page.getByRole("slider", { name: "Luminance noise" }),
  ).toBeVisible();
  // Off its As Shot balance, a RAW develops into its own texture, from samples it writes back.
  await page.evaluate(() =>
    window.openlight.setWhiteBalance({ temperature: 4000, tint: 20 }),
  );
  const points = grid(96, 128);
  const noisy = await readImage(page, undefined, points);
  await page.evaluate(() =>
    window.openlight.setNoiseReduction({ luminance: 75, color: 75 }),
  );
  const reduced = await readImage(page, undefined, points);
  const before = measure(noisy.samples ?? []);
  const after = measure(reduced.samples ?? []);
  expect(after.lightNoise).toBeLessThan(before.lightNoise / 3);
  expect(after.colorNoise).toBeLessThan(before.colorNoise / 3);
  expect(Math.abs(after.light - before.light)).toBeLessThan(2);
  // The reductions stay, so changing strengths needs no other, and 0 develops the decoded samples.
  await page.evaluate(() =>
    window.openlight.setNoiseReduction({ luminance: 0, color: 0 }),
  );
  expect((await readImage(page, undefined, points)).samples).toEqual(
    noisy.samples,
  );
});

test("Noise reduction cleans an image's color and light apart", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  await page.evaluate(
    (url) => window.openlight.loadUrl(url),
    "/tests/fixtures/noisy.png",
  );
  const points = grid(64, 96);
  const noisy = await readImage(page, undefined, points);
  const before = measure(noisy.samples ?? []);
  await page.evaluate(() =>
    window.openlight.setNoiseReduction({ luminance: 0, color: 75 }),
  );
  const colorOnly = measure(
    (await readImage(page, undefined, points)).samples ?? [],
  );
  expect(colorOnly.colorNoise).toBeLessThan(before.colorNoise / 2);
  expect(colorOnly.lightNoise).toBeGreaterThan(before.lightNoise * 0.6);
  await page.evaluate(() =>
    window.openlight.setNoiseReduction({ luminance: 75 }),
  );
  const both = measure(
    (await readImage(page, undefined, points)).samples ?? [],
  );
  expect(both.lightNoise).toBeLessThan(before.lightNoise / 2);
  expect(Math.abs(both.light - before.light)).toBeLessThan(2);
  await page.evaluate(() =>
    window.openlight.setNoiseReduction({ luminance: 0, color: 0 }),
  );
  expect((await readImage(page, undefined, points)).samples).toEqual(
    noisy.samples,
  );
});
