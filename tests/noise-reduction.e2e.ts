import { expect, test } from "./fixtures";
import { readImage } from "./images";

/** Points across the fixture, flat but for its noise: a 96 × 128 image once oriented. */
const points = Array.from(
  { length: 48 },
  (_, i) => [12 + (i % 6) * 14, 12 + Math.floor(i / 6) * 14] as const,
);

/** Each channel's mean and deviation over the sampled points. */
function measure(samples: number[][]) {
  return [0, 1, 2].map((channel) => {
    const values = samples.map((sample) => sample[channel]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
    return { mean, deviation: Math.sqrt(variance) };
  });
}

test("Noise reduction cleans a noisy RAW before demosaicing and fades back", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  await page.evaluate(
    (url) => window.openlight.loadUrl(url),
    "/tests/fixtures/raw/noisy-bayer.dng",
  );
  await expect(
    page.getByRole("slider", { name: "Noise reduction" }),
  ).toBeVisible();
  // Off its As Shot balance, a RAW develops into its own texture, from samples it writes back.
  await page.evaluate(() =>
    window.openlight.setWhiteBalance({ temperature: 4000, tint: 20 }),
  );
  const noisy = await readImage(page, undefined, points);
  await page.evaluate(() => window.openlight.setNoiseReduction(100));
  const reduced = await readImage(page, undefined, points);
  const before = measure(noisy.samples ?? []);
  const after = measure(reduced.samples ?? []);
  for (const [channel, { mean, deviation }] of after.entries()) {
    expect(deviation, `Channel ${channel}`).toBeLessThan(
      before[channel].deviation / 3,
    );
    expect(
      Math.abs(mean - before[channel].mean),
      `Channel ${channel}`,
    ).toBeLessThan(4);
  }
  // The reduced samples stay, so fading needs no second reduction, and 0 develops the decoded ones.
  await page.evaluate(() => window.openlight.setNoiseReduction(0));
  expect((await readImage(page, undefined, points)).samples).toEqual(
    noisy.samples,
  );
});
