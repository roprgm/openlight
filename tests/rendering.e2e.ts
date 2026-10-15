import { readFile } from "node:fs/promises";
import { expect, expectNear, openApp, test } from "./fixtures";

function linear(value: number) {
  const encoded = value / 255;
  return encoded <= 0.04045
    ? encoded / 12.92
    : ((encoded + 0.055) / 1.055) ** 2.4;
}

test("tone adjustments preserve ramps, colors and alpha, compose, and reset", async ({
  page,
}) => {
  await openApp(page);
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
            (value, i) => i % 4 !== 3 || Math.abs(value - neutral[i]) <= 1,
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
        resetMatches: neutral.every(
          (value, i) => Math.abs(value - reset[i]) <= 1,
        ),
      };
    },
    [...bytes],
  );
  const [original, whites, blacks, clipped, negative, half, positive, shadows] =
    result.outputs;
  const ramp = Array.from({ length: 256 }, (_, x) => x);
  expectNear(original.ramp, ramp, 1);
  for (const output of result.outputs) {
    expect(output.alphaMatches).toBe(true);
    expect(output.grayMatches).toBe(true);
    // A gradient stays smooth: it never steps back or jumps.
    for (let x = 1; x < 256; x++) {
      expect(output.ramp[x] - output.ramp[x - 1]).toBeGreaterThanOrEqual(-1);
      expect(output.ramp[x] - output.ramp[x - 1]).toBeLessThanOrEqual(16);
    }
  }
  // Whites and blacks each brighten their half of the ramp and leave the other.
  expectNear(whites.ramp.slice(0, 129), ramp.slice(0, 129), 1);
  expect(whites.ramp[192]).toBeGreaterThan(200);
  expect(whites.ramp[230]).toBeGreaterThanOrEqual(254);
  expectNear(whites.colorEnds[1], [255, 255, 255], 1);
  expectNear(blacks.ramp.slice(128), ramp.slice(128), 1);
  expect(blacks.ramp[64]).toBeGreaterThan(70);
  expectNear([blacks.ramp[0]], [25], 3);
  // Negative whites and blacks pull the ends in and clip the darkest tones.
  expectNear([clipped.ramp[128]], [128], 1);
  expect(clipped.ramp[25]).toBeLessThanOrEqual(1);
  expectNear(clipped.colorEnds[0], [0, 0, 0], 1);
  expectNear([clipped.ramp[255]], [230], 3);
  for (let x = 0; x < 256; x++) {
    expect(negative.ramp[x]).toBeLessThanOrEqual(half.ramp[x] + 1);
    expect(half.ramp[x]).toBeLessThanOrEqual(x + 1);
    expect(positive.ramp[x]).toBeGreaterThanOrEqual(x - 1);
    expect(shadows.ramp[x]).toBeGreaterThanOrEqual(x - 1);
    // Half the slider moves halfway in linear light.
    expect(
      Math.abs(
        linear(half.ramp[x]) - (linear(x) + linear(negative.ramp[x])) / 2,
      ),
    ).toBeLessThan(0.02);
  }
  // Highlights move the light end and Shadows the dark end, each leaving the other; black and white stay.
  expect(negative.ramp[224]).toBeLessThan(214);
  expect(positive.ramp[192]).toBeGreaterThan(202);
  expect(shadows.ramp[32]).toBeGreaterThan(40);
  for (const output of [negative, positive]) {
    expectNear([output.ramp[16]], [16], 3);
  }
  expectNear([shadows.ramp[224]], [224], 3);
  for (const output of [negative, half, positive, shadows]) {
    expect(output.ramp[0]).toBeLessThanOrEqual(1);
  }
  expect(shadows.ramp[255]).toBeGreaterThanOrEqual(254);
  // Highlights keep each patch's hue: both patches share a tone and move together.
  expectNear(original.patches, [240, 240], 1);
  expectNear([negative.patches[0]], [negative.patches[1]], 1);
  expect(negative.patches[0]).toBeLessThan(236);
  expectNear([positive.patches[0]], [positive.patches[1]], 1);
  expect(positive.patches[0]).toBeGreaterThan(244);
  expect(Math.abs(negative.pastel[0] - negative.pastel[2])).toBeLessThanOrEqual(
    2,
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
  // A proxy half a texel off strays 7e-4 on average; filtering and half-float rounding stay far below.
  expect(result.meanStray).toBeLessThan(5e-4);
  expect(result.stray).toBeLessThan(0.01);
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
  // Half floats hold these values exactly; the tolerance covers GPUs whose exp2 rounds.
  const expectFloats = (actual: number[], expected: number[]) => {
    for (const [channel, value] of expected.entries()) {
      expect(actual[channel]).toBeCloseTo(value, 2);
    }
  };
  for (const exposed of result.exposed) {
    expectFloats(exposed, [2, 4, 6, 0.75]);
  }
  expectFloats(result.recovered[0], [0.25, 0.5, 0.75, 0.75]);
  expectFloats(result.recovered[2], [2, 4, 6, 0.75]);
  expect(result.recovered[1][2]).toBeGreaterThan(1);
  expect(result.recovered[1][3]).toBeCloseTo(0.75, 2);
});
