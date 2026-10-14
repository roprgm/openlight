import { expect, expectNear, test } from "./fixtures";
import { readImage, readPreview } from "./images";

test("open a blank canvas, the sample JPEG, TIFF, RAW, and SVG files, take XMP settings, survive a failed open, and export while another opens", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  const opened = () =>
    page.evaluate(() => {
      const { documentId, file, size } = window.openlight.getState();
      return documentId && { file, size };
    });
  const open = (url: string) =>
    page.evaluate((url) => window.openlight.loadUrl(url), url);
  const exposure = (exposure: number) =>
    page.evaluate(
      (exposure) => window.openlight.setAdjustments({ exposure }),
      exposure,
    );

  await test.step("a blank canvas", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: /Blank canvas/ }).click();
    await page.getByRole("button", { name: /Square/ }).click();
    await expect.poll(opened).toEqual({ file: "Untitled", size: [3000, 3000] });
    // A small export reads the white canvas without encoding 9 megapixels.
    const small = await page.evaluate(async () => [
      ...new Uint8Array(
        await (
          await window.openlight.exportImage({ longEdge: 30 })
        ).arrayBuffer(),
      ),
    ]);
    expectNear(
      (await readImage(page, new Uint8Array(small))).center,
      [255, 255, 255, 255],
    );
  });

  await test.step("the sample photo, a JPEG", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: /Sample photo/ }).click();
    await expect.poll(opened).toEqual({ file: "demo.jpg", size: [1400, 764] });
    // The hiker's jacket, the forest, and the sky.
    const { samples = [] } = await readImage(page, undefined, [
      [440, 430],
      [100, 280],
      [700, 60],
    ]);
    expectNear(samples[0], [106, 26, 15, 255], 6);
    expectNear(samples[1], [30, 32, 21, 255], 6);
    expectNear(samples[2], [245, 244, 240, 255], 6);
  });

  await test.step("TIFF files keep their color, orientation, headroom, and alpha", async () => {
    // A gray profile file exported back to sRGB returns its encoded value: 16384 of 65535 is 64 of 255.
    await open("/tests/fixtures/gray16-para.tif");
    const gray = await readImage(page);
    expect(gray.size).toEqual([7, 5]);
    expectNear(gray.center, [64, 64, 64, 255]);
    await open("/tests/fixtures/orientation-6.tif");
    expect((await readImage(page)).size).toEqual([17, 19]);

    // Row 1 of the float file holds linear 1, 2, and 4 at x = 4..6: all clip at first, then separate at -2 stops.
    await open("/tests/fixtures/float32-be.tif");
    const reds = async () => {
      const { samples = [] } = await readImage(page, undefined, [
        [4, 1],
        [5, 1],
        [6, 1],
      ]);
      return samples.map((pixel) => pixel[0]);
    };
    expectNear(await reds(), [255, 255, 255]);
    await exposure(-2);
    const [one, two, four] = await reds();
    expect(one).toBeLessThan(150);
    expect(two).toBeGreaterThan(one);
    expect(four).toBeGreaterThan(240);

    // The blue pixel brightens without losing its hue, then approaches white.
    await open("/tests/fixtures/blue-float.tif");
    await exposure(2);
    const [red, green, blue] = (await readImage(page)).center;
    expect(blue - Math.max(red, green)).toBeGreaterThan(20);
    await exposure(5);
    const white = (await readImage(page)).center.slice(0, 3);
    expect(Math.min(...white)).toBeGreaterThan(240);
    expect(Math.max(...white) - Math.min(...white)).toBeLessThan(10);

    await open("/tests/fixtures/alpha16.tif");
    const alpha = await readImage(page);
    expect(alpha.size).toEqual([7, 5]);
    // Export composites 50% alpha over the editor's 0.09 display background.
    expectNear(alpha.center, [43, 75, 107, 255]);
  });

  for (const name of ["bayer.dng", "linear-jxl.dng"]) {
    await test.step(`${name} opens in color and takes white balance`, async () => {
      await open(`/tests/fixtures/raw/${name}`);
      const image = await readImage(page);
      expect(image.size).toEqual([96, 128]);
      // The fixture's camera profile is sRGB with known linear samples .5, .25, .125.
      expectNear(image.center, [188, 137, 99, 255], 6);
      await page.evaluate(() =>
        window.openlight.setWhiteBalance({ temperature: 4000, tint: 20 }),
      );
      const cool = await readImage(page);
      // Full SDK camera calibration, including its white-point normalization.
      expectNear(cool.center, [192, 161, 166, 255], 6);
      expect(cool.center[2] - image.center[2]).toBeGreaterThan(40);
      await expect
        .poll(async () => {
          const { center } = await readPreview(page);
          return Math.max(
            ...[0, 1, 2].map((i) => Math.abs(center[i] - cool.center[i])),
          );
        })
        .toBeLessThanOrEqual(4);
      await page.getByRole("button", { name: "As Shot", exact: true }).click();
      expectNear((await readImage(page)).center, image.center, 1);
    });
  }

  await test.step("an SVG takes XMP settings and survives a failed open", async () => {
    await open("/tests/fixtures/photo.svg");
    expectNear((await readImage(page)).center, [128, 128, 128, 255]);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open an image or scene" }).click();
    await (await chooser).setFiles({
      name: "photo.xmp",
      mimeType: "",
      buffer: Buffer.from(
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:Exposure2012="-1" /></rdf:RDF>',
      ),
    });
    await expect(
      page.getByRole("textbox", { name: "Exposure", exact: true }),
    ).toHaveValue("-1.00");
    const edited = await readImage(page);
    expect(edited.center[0]).toBeLessThan(110);

    const { documentId } = await state();
    await page.evaluate(() =>
      window.openlight.loadImage(new File(["invalid"], "broken.png")),
    );
    const failure = page.getByText("Couldn't open broken.png:", {
      exact: false,
    });
    await expect(failure).toBeVisible();
    expect(await state()).toMatchObject({
      documentId,
      failure: { file: "broken.png" },
      adjustments: { exposure: -1 },
    });
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(failure).toBeHidden();

    // Export renders the scene it captured, even when another image opens before it encodes.
    const exported = await page.evaluate(async () => {
      const api = window.openlight;
      const convert = OffscreenCanvas.prototype.convertToBlob;
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      OffscreenCanvas.prototype.convertToBlob = async function (options) {
        await gate;
        return convert.call(this, options);
      };
      try {
        const pending = api.exportImage();
        await api.loadImage(
          new File(
            [
              '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>',
            ],
            "replacement.svg",
            { type: "image/svg+xml" },
          ),
        );
        release();
        return [...new Uint8Array(await (await pending).arrayBuffer())];
      } finally {
        release();
        OffscreenCanvas.prototype.convertToBlob = convert;
      }
    });
    expect(await readImage(page, new Uint8Array(exported))).toEqual(edited);
    expect(await state()).toMatchObject({
      size: [32, 32],
      adjustments: { exposure: 0 },
      history: { undoCount: 0 },
    });
  });
});
