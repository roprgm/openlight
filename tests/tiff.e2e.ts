import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("TIFF files open with their color, orientation, headroom, and alpha", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  const open = (name: string) =>
    page.evaluate(
      (url) => window.openlight.loadUrl(url),
      `/tests/fixtures/${name}`,
    );
  const exposure = (exposure: number) =>
    page.evaluate(
      (exposure) => window.openlight.setAdjustments({ exposure }),
      exposure,
    );
  // A gray profile file exported back to sRGB returns its encoded value: 16384 of 65535 is 64 of 255.
  await open("gray16-para.tif");
  const gray = await readImage(page);
  expect(gray.size).toEqual([7, 5]);
  for (const value of gray.center.slice(0, 3)) {
    expect(Math.abs(value - 64)).toBeLessThanOrEqual(1);
  }
  await open("orientation-6.tif");
  expect((await readImage(page)).size).toEqual([17, 19]);

  // Row 1 of the float file holds linear 1, 2, and 4 at x = 4..6: all clip at first, then separate at -2 stops.
  await open("float32-be.tif");
  const reds = async () => {
    const { samples = [] } = await readImage(page, undefined, [
      [4, 1],
      [5, 1],
      [6, 1],
    ]);
    return samples.map((pixel) => pixel[0]);
  };
  expect(await reds()).toEqual([255, 255, 255]);
  await exposure(-2);
  const [one, two, four] = await reds();
  expect(one).toBeLessThan(150);
  expect(two).toBeGreaterThan(one);
  expect(four).toBeGreaterThan(240);

  // The blue pixel brightens without losing its hue, then approaches white.
  await open("blue-float.tif");
  await exposure(2);
  const [red, green, blue] = (await readImage(page)).center;
  expect(blue - Math.max(red, green)).toBeGreaterThan(20);
  await exposure(5);
  const white = (await readImage(page)).center.slice(0, 3);
  expect(Math.min(...white)).toBeGreaterThan(240);
  expect(Math.max(...white) - Math.min(...white)).toBeLessThan(10);

  await open("alpha16.tif");
  const alpha = await readImage(page);
  expect(alpha.size).toEqual([7, 5]);
  // Export composites 50% alpha over the editor's 0.09 display background.
  for (const [i, expected] of [43, 75, 107, 255].entries()) {
    expect(Math.abs(alpha.center[i] - expected)).toBeLessThanOrEqual(1);
  }
});
