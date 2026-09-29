import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

const directory = "tests/fixtures";

test("TIFF files open through the loader with their color, orientation, headroom, alpha, and error recovery", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  const load = async (name: string) => {
    const bytes = [...(await readFile(`${directory}/${name}`))];
    await page.evaluate(
      ({ bytes, name }) =>
        window.openlight.loadImage(new File([new Uint8Array(bytes)], name)),
      { bytes, name },
    );
  };
  // A gray profile file exported back to sRGB returns its encoded value: 16384 of 65535 is 64 of 255.
  await load("gray16-para.tif");
  const gray = await readImage(page);
  expect(gray.size).toEqual([7, 5]);
  for (const value of gray.center.slice(0, 3)) {
    expect(Math.abs(value - 64)).toBeLessThanOrEqual(1);
  }
  await load("orientation-6.tif");
  expect((await readImage(page)).size).toEqual([17, 19]);
  // Row 1 of the float file holds linear 1, 2, and 4 at x = 4..6: all clip at first, then separate at -2 stops.
  await load("float32-be.tif");
  const reds = async () => {
    const { samples } = await readImage(page, undefined, [
      [4, 1],
      [5, 1],
      [6, 1],
    ]);
    return samples?.map((pixel) => pixel[0]) ?? [];
  };
  expect(await reds()).toEqual([255, 255, 255]);
  await page.evaluate(() => window.openlight.setAdjustments({ exposure: -2 }));
  const recovered = await reds();
  expect(recovered[0]).toBeLessThan(150);
  expect(recovered[1]).toBeGreaterThan(recovered[0]);
  expect(recovered[2]).toBeGreaterThan(240);
  // The blue pixel brightens without losing its hue, then approaches white.
  await load("blue-float.tif");
  const colors = [];
  for (const exposure of [0, 2, 5]) {
    await page.evaluate(
      (exposure) => window.openlight.setAdjustments({ exposure }),
      exposure,
    );
    colors.push((await readImage(page)).center.slice(0, 3));
  }
  for (const rgb of colors.slice(0, 2)) {
    expect(rgb[2] - Math.max(rgb[0], rgb[1])).toBeGreaterThan(20);
  }
  const brightness = colors.map((rgb) =>
    rgb.reduce((sum, value) => sum + value, 0),
  );
  expect(brightness[1]).toBeGreaterThan(brightness[0]);
  const white = colors[2];
  expect(Math.min(...white)).toBeGreaterThan(240);
  expect(Math.max(...white) - Math.min(...white)).toBeLessThan(10);
  await load("rgb8-jpeg.tif");
  await expect(
    page.getByText("Couldn't open rgb8-jpeg.tif:", { exact: false }),
  ).toBeVisible();
  // Recover in the same session after the package rejects an unsupported TIFF.
  await load("alpha16.tif");
  const alpha = await readImage(page);
  expect(alpha.size).toEqual([7, 5]);
  // Export composites 50% alpha over the editor's 0.09 display background.
  for (const [i, expected] of [43, 75, 107, 255].entries()) {
    expect(Math.abs(alpha.center[i] - expected)).toBeLessThanOrEqual(1);
  }
  await expect(
    page.getByText("Couldn't open rgb8-jpeg.tif:", { exact: false }),
  ).toBeHidden();
});
