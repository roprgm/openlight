import { expect, test } from "./fixtures";

// Full-resolution Gaussian reference, independent of GPU passes and working-space conversion.
function expectedStep(x: number, amount: number, sigma: number) {
  let sum = 0;
  let weights = 0;
  const radius = Math.ceil(3 * sigma);
  for (let offset = -radius; offset <= radius; offset++) {
    const weight = Math.exp(-0.5 * (offset / sigma) ** 2);
    sum += (x + offset < 512 ? 64 : 192) * weight;
    weights += weight;
  }
  const original = x < 512 ? 64 : 192;
  return Math.max(
    0,
    Math.min(255, original + amount * (original - sum / weights)),
  );
}

test("detail filters follow Gaussian unsharp masking and preserve flat fields and alpha", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  const xs = [0, 384, 448, 504, 509, 510, 511, 512, 513, 514, 519, 576, 640];
  const settings = [
    { clarity: -100, sharpening: 0, sharpenRadius: 1 },
    { clarity: 100, sharpening: 0, sharpenRadius: 1 },
    { clarity: 0, sharpening: 150, sharpenRadius: 0.5 },
    { clarity: 0, sharpening: 50, sharpenRadius: 1.7 },
    { clarity: 0, sharpening: 100, sharpenRadius: 3 },
  ];
  const result = await page.evaluate(
    async ({ xs, settings }) => {
      const api = window.openlight;
      const load = (width: number, height: number, shapes: string) =>
        api.loadImage(
          new File(
            [
              `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes}</svg>`,
            ],
            "probe.svg",
            { type: "image/svg+xml" },
          ),
        );
      const read = async (positions: number[][]) => {
        const image = await createImageBitmap(await api.exportImage());
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Cannot read clarity probe.");
        context.drawImage(image, 0, 0);
        image.close();
        return positions.map(([x, y]) => [
          ...context.getImageData(x, y, 1, 1).data,
        ]);
      };
      await load(
        1024,
        129,
        '<rect width="512" height="129" fill="rgb(64,64,64)"/><rect x="512" width="512" height="129" fill="rgb(192,192,192)"/>',
      );
      const steps = [];
      for (const adjustment of settings) {
        api.setDetails(adjustment);
        steps.push(await read(xs.map((x) => [x, 64])));
      }
      // An opaque half beside a translucent half of the same color, then transparency.
      await load(
        127,
        65,
        '<rect width="40" height="65" fill="#737373"/><rect x="40" width="40" height="65" fill="#737373" fill-opacity="0.5"/>',
      );
      const positions = [
        [10, 32],
        [39, 32],
        [40, 32],
        [79, 32],
        [80, 32],
        [126, 64],
      ];
      const neutral = await read(positions);
      const filtered = [];
      for (const clarity of [-100, 100]) {
        api.setDetails({ clarity, sharpening: 150, sharpenRadius: 3 });
        filtered.push(await read(positions));
      }
      return { steps, neutral, filtered };
    },
    { xs, settings },
  );
  for (const [s, pixels] of result.steps.entries()) {
    const { clarity, sharpening, sharpenRadius } = settings[s];
    const amount = sharpening ? sharpening / 50 : clarity / 200;
    const sigma = sharpening ? sharpenRadius : 64;
    for (const [i, pixel] of pixels.entries()) {
      for (const channel of pixel.slice(0, 3)) {
        const expected = expectedStep(xs[i], amount, sigma);
        expect(Math.abs(channel - expected)).toBeLessThanOrEqual(2);
      }
      expect(pixel[3]).toBe(255);
    }
  }
  expect(result.neutral[0]).toEqual([115, 115, 115, 255]);
  for (const pixels of result.filtered) {
    for (const [i, pixel] of pixels.entries()) {
      expect(pixel[3]).toBe(result.neutral[i][3]);
      for (const [channel, value] of pixel.entries()) {
        expect(
          Math.abs(value - result.neutral[i][channel]),
        ).toBeLessThanOrEqual(2);
      }
    }
  }
});
