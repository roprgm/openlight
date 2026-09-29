import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("loads a HEIC image with the expected dimensions and pixels", async ({
  page,
}) => {
  const bytes = await readFile(
    new URL("./fixtures/patches.heic", import.meta.url),
  );
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  const supported = await page.evaluate(async () => {
    if (!("VideoDecoder" in window)) {
      return false;
    }
    // Main Still Picture profile used by patches.heic.
    return (await VideoDecoder.isConfigSupported({ codec: "hvc1.3.e.L30" }))
      .supported;
  });
  test.skip(!supported, "This browser has no HEVC Main Still Picture decoder.");
  await page.evaluate(
    (bytes) =>
      window.openlight.loadImage(
        new File([new Uint8Array(bytes)], "patches.heic", {
          type: "image/heic",
        }),
      ),
    [...bytes],
  );
  const result = await readImage(page, undefined, [
    [16, 16],
    [48, 16],
    [16, 48],
    [48, 48],
  ]);

  expect(result.size).toEqual([64, 64]);
  // Reference pixels decoded independently with libheif.
  const expected = [
    176, 96, 95, 255, 97, 176, 97, 255, 94, 95, 175, 255, 128, 128, 128, 255,
  ];
  result.samples?.flat().forEach((value, i) => {
    expect(Math.abs(value - expected[i]), `Channel ${i}`).toBeLessThanOrEqual(
      3,
    );
  });
});
