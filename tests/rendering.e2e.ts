import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

function linear(value: number) {
  const encoded = value / 255;
  return encoded <= 0.04045
    ? encoded / 12.92
    : ((encoded + 0.055) / 1.055) ** 2.4;
}

test("tone adjustments preserve ramps, colors and alpha, compose, and reset", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.openlight);
  const bytes = await readFile("tests/fixtures/tones.png");
  const result = await page.evaluate(
    async (bytes) => {
      const api = window.openlight;
      await api.loadImage(
        new File([new Uint8Array(bytes)], "tones.png", { type: "image/png" }),
      );
      const defaults = api.getState().adjustments;
      const canvas = new OffscreenCanvas(256, 128);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot read tone chart.");
      const read = async () => {
        const image = await createImageBitmap(await api.exportImage());
        context.clearRect(0, 0, 256, 128);
        context.drawImage(image, 0, 0);
        image.close();
        return [...context.getImageData(0, 0, 256, 128).data];
      };
      const neutral = await read();
      const outputs = [];
      for (const change of [
        {},
        { whites: 100 },
        { blacks: 100 },
        { whites: -100, blacks: -100 },
        { highlights: -100 },
        { highlights: -50 },
        { highlights: 100 },
        { shadows: 100 },
      ]) {
        api.setAdjustments({ ...defaults, ...change });
        const pixels = await read();
        outputs.push({
          ramp: Array.from({ length: 256 }, (_, x) => pixels[x * 4]),
          pastel: pixels.slice(126 * 256 * 4, 126 * 256 * 4 + 3),
          patches: [64, 192].map((x) => pixels[(96 * 256 + x) * 4]),
          colorEnds: [25, 255].map((x) =>
            pixels.slice((125 * 256 + x) * 4, (125 * 256 + x) * 4 + 3),
          ),
          alphaMatches: pixels.every(
            (value, i) => i % 4 !== 3 || value === neutral[i],
          ),
          grayMatches: pixels
            .slice(0, 256 * 4)
            .every(
              (value, i) =>
                i % 4 === 3 || Math.abs(value - pixels[i - (i % 4)]) <= 1,
            ),
        });
      }
      api.setAdjustments(defaults);
      const reset = await read();
      return {
        outputs,
        resetMatches: neutral.every((value, i) => value === reset[i]),
      };
    },
    [...bytes],
  );
  const [original, whites, blacks, clipped, negative, half, positive, shadows] =
    result.outputs;
  for (const output of result.outputs) {
    expect(output.alphaMatches).toBe(true);
    expect(output.grayMatches).toBe(true);
    for (let x = 1; x < 256; x++) {
      expect(output.ramp[x] - output.ramp[x - 1]).toBeGreaterThanOrEqual(-1);
      expect(output.ramp[x] - output.ramp[x - 1]).toBeLessThanOrEqual(6);
    }
  }
  expect(original.ramp).toEqual(Array.from({ length: 256 }, (_, x) => x));
  // Whites and blacks each leave the other half of the ramp untouched.
  expect(whites.ramp.slice(0, 129)).toEqual(original.ramp.slice(0, 129));
  expect(blacks.ramp.slice(128)).toEqual(original.ramp.slice(128));
  expect(clipped.ramp[128]).toBe(128);
  expect(whites.ramp[230]).toBe(255);
  expect(whites.colorEnds[1]).toEqual([255, 255, 255]);
  expect(clipped.ramp[25]).toBe(0);
  expect(clipped.colorEnds[0]).toEqual([0, 0, 0]);
  expect(blacks.ramp[0]).toBeGreaterThanOrEqual(25);
  expect(blacks.ramp[0]).toBeLessThanOrEqual(26);
  expect(clipped.ramp[255]).toBeGreaterThanOrEqual(229);
  expect(clipped.ramp[255]).toBeLessThanOrEqual(230);
  for (let x = 0; x < 256; x++) {
    expect(negative.ramp[x]).toBeLessThanOrEqual(half.ramp[x]);
    expect(half.ramp[x]).toBeLessThanOrEqual(x);
    expect(positive.ramp[x]).toBeGreaterThanOrEqual(x);
    expect(shadows.ramp[x]).toBeGreaterThanOrEqual(x);
    // Half the slider moves halfway in linear light.
    expect(
      Math.abs(
        linear(half.ramp[x]) - (linear(x) + linear(negative.ramp[x])) / 2,
      ),
    ).toBeLessThan(0.01);
  }
  for (const output of [negative, half, positive, shadows]) {
    expect(output.ramp[0]).toBe(0);
  }
  expect(shadows.ramp[255]).toBe(255);
  expect(original.patches).toEqual([240, 240]);
  expect(negative.patches[0]).toBe(negative.patches[1]);
  expect(negative.patches[0]).toBeLessThan(240);
  expect(positive.patches[0]).toBe(positive.patches[1]);
  expect(positive.patches[0]).toBeGreaterThan(240);
  expect(Math.abs(negative.pastel[0] - negative.pastel[2])).toBeLessThanOrEqual(
    1,
  );
  for (let channel = 0; channel < 3; channel++) {
    expect(negative.pastel[channel]).toBeLessThan(original.pastel[channel]);
  }
  expect(result.resetMatches).toBe(true);
});

test("a perspective-corrected proxy shows the full render it stands for", async ({
  page,
}) => {
  await page.goto("/tests/gpu.html");
  const result = await page.evaluate(async () => {
    const path = "/tests/perspective-gpu.ts";
    const { perspectiveProxy } = (await import(
      path
    )) as typeof import("./perspective-gpu");
    return perspectiveProxy();
  });
  expect(result.errors).toEqual([]);
  expect(result.proxySize).toEqual([240, 160]);
  // The correction moved the output's corner into the chart, and the proxy follows it texel by texel.
  expect(Math.max(...result.corner)).toBeGreaterThan(0.02);
  // Less than the 2e-3 a half-texel shift of the proxy would make, beyond half-float rounding.
  expect(result.stray).toBeLessThan(1.5e-3);
});

test("a gradient recovers +3 EV photo exposure without clipping between layers", async ({
  page,
}) => {
  await page.goto("/tests/gpu.html");
  const result = await page.evaluate(async () => {
    const path = "/tests/exposure-gpu.ts";
    const { recoverExposure } = (await import(
      path
    )) as typeof import("./exposure-gpu");
    return recoverExposure();
  });
  expect(result.errors).toEqual([]);
  for (const exposed of result.exposed) {
    expect(exposed).toEqual([2, 4, 6, 0.75]);
  }
  expect(result.recovered[0]).toEqual([0.25, 0.5, 0.75, 0.75]);
  expect(result.recovered[2]).toEqual([2, 4, 6, 0.75]);
  expect(result.recovered[1][2]).toBeGreaterThan(1);
  expect(result.recovered[1][3]).toBe(0.75);
});
