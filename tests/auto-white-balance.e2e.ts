import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

/** Gray stripes under warm light, as linear sRGB encoded in an SVG; the middle stripe is middle gray. */
function castWedge() {
  const light = [1.3, 1, 0.6];
  const middle =
    0.18 / (0.2126 * light[0] + 0.7152 * light[1] + 0.0722 * light[2]);
  // The sRGB curve above its linear toe, which no stripe reaches.
  const encode = (value: number) =>
    Math.round(255 * (1.055 * value ** (1 / 2.4) - 0.055))
      .toString(16)
      .padStart(2, "0");
  const stripes = [
    [0, 48, 0.3],
    [48, 96, 0.55],
    [96, 160, 1],
    [160, 208, 1.7],
    [208, 256, 2.6],
  ].map(([x, end, level]) => {
    const fill = light.map((channel) => encode(middle * level * channel));
    return `<rect x="${x}" width="${end - x}" height="128" fill="#${fill.join("")}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128">${stripes.join("")}</svg>`;
}

function spread([r, g, b]: number[]) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

const undoCount = (page: Page) =>
  page.evaluate(() => window.openlight.getState().history.undoCount);

test("Auto takes most of a warm photo's cast away as one undoable edit", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "cast.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(castWedge()),
  });
  const auto = page.getByRole("button", { name: "Auto", exact: true });
  await expect(auto).toBeVisible();
  const cast = await readImage(page);
  expect(spread(cast.center)).toBeGreaterThan(30);

  await auto.click();
  await expect.poll(() => undoCount(page)).toBe(1);
  // A starting point: most of the cast goes.
  expect(spread((await readImage(page)).center)).toBeLessThan(
    spread(cast.center) / 4,
  );
  const { incrementalTemperature } = await page.evaluate(
    () => window.openlight.getState().adjustments,
  );
  expect(incrementalTemperature).toBeLessThan(0);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await readImage(page)).toEqual(cast);
});

test("Auto moves a RAW photo's white balance from As Shot toward neutral", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  const bytes = [...(await readFile("tests/fixtures/raw/bayer.dng"))];
  await page.evaluate(
    (bytes) =>
      window.openlight.loadImage(
        new File([new Uint8Array(bytes)], "bayer.dng"),
      ),
    bytes,
  );
  const asShot = await page.evaluate(
    () => window.openlight.getState().whiteBalance,
  );
  const cast = await readImage(page);
  expect(spread(cast.center)).toBeGreaterThan(80);

  await page.getByRole("button", { name: "Auto", exact: true }).click();
  await expect.poll(() => undoCount(page)).toBe(1);
  expect(spread((await readImage(page)).center)).toBeLessThan(
    spread(cast.center) / 4,
  );
  const balance = await page.evaluate(
    () => window.openlight.getState().whiteBalance,
  );
  expect(balance?.temperature).toBeLessThan(asShot?.temperature ?? 0);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await readImage(page)).toEqual(cast);
  // The cast is measured on the As Shot development, so Auto gives the same balance again.
  await page.evaluate(() => window.openlight.autoWhiteBalance());
  expect(
    await page.evaluate(() => window.openlight.getState().whiteBalance),
  ).toEqual(balance);
});

test("Auto drops its result when another photo opens while it measures", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  const photo = [...Buffer.from(castWedge())];
  await page.evaluate(async (bytes) => {
    const open = () =>
      window.openlight.loadImage(
        new File([new Uint8Array(bytes)], "cast.svg", {
          type: "image/svg+xml",
        }),
      );
    await open();
    const auto = window.openlight.autoWhiteBalance();
    await open();
    await auto;
  }, photo);
  expect(await undoCount(page)).toBe(0);
});
