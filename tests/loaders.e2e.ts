import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";

test("an image beyond the GPU's texture limit fails before decoding, saying how large it is", async ({
  page,
}) => {
  await openPhoto(page);
  const limit = await page.evaluate(
    async () =>
      (await navigator.gpu.requestAdapter())?.limits.maxTextureDimension2D ?? 0,
  );
  const count = new Intl.NumberFormat("en-US");
  const over = limit + 1;
  // A PNG header with nothing decodable after it: the size error shows the check came first.
  const png = Buffer.alloc(40);
  png.write("\x89PNG\r\n\x1a\n", "latin1");
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12);
  png.writeUInt32BE(over, 16);
  png.writeUInt32BE(1, 20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="${over}"/>`;
  const cases = [
    {
      file: { name: "wide.png", mimeType: "image/png", buffer: png },
      size: `${count.format(over)} × 1`,
    },
    {
      file: {
        name: "tall.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(svg),
      },
      size: `10 × ${count.format(over)}`,
    },
  ];
  for (const { file, size } of cases) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open an image or scene" }).click();
    await (await chooser).setFiles(file);
    await expect(
      page.getByText(
        `Couldn't open ${file.name}: Error: This device opens images up to ${count.format(limit)} pixels per side; this one is ${size}.`,
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  }
  expect(await page.evaluate(() => window.openlight.getState().file)).toBe(
    "photo.svg",
  );
});

test("a photo takes XMP settings, survives a failed open, and exports while another replaces it", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  await openPhoto(page);
  expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
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
  expect(edited.center[0]).toBeLessThan(128);

  const { documentId } = await state();
  await page.evaluate(() =>
    window.openlight.loadImage(new File(["invalid"], "broken.png")),
  );
  const failure = page.getByText("Couldn't open broken.png:", { exact: false });
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
          ['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>'],
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
