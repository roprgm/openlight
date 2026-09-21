import { expect, test } from "./fixtures";

function luminance(rgb: number[]) {
  return rgb[0] * 0.2627 + rgb[1] * 0.678 + rgb[2] * 0.0593;
}

test("color mixing preserves luminance, neutrals, alpha and HDR, isolates ranges and joins the hue seam", async ({
  page,
}) => {
  await page.goto("/tests/gpu.html");
  const { original, outputs, sampleCount } = await page.evaluate(async () => {
    const path = "/tests/color-mixer-gpu.ts";
    const { probeColorMixer } = (await import(
      path
    )) as typeof import("./color-mixer-gpu");
    return probeColorMixer();
  });
  const [neutral, hueUp, hueDown, gray, lighter, darker, blue, red] = outputs;
  expect(neutral).toEqual(original);
  for (const output of outputs) {
    expect(output.every(Number.isFinite)).toBe(true);
    for (let i = 3; i < output.length; i += 4) {
      expect(output[i]).toBe(original[i]);
    }
    for (const index of [8, 9, 10]) {
      expect(output.slice(index * 4, index * 4 + 4)).toEqual(
        original.slice(index * 4, index * 4 + 4),
      );
    }
  }
  for (let index = 0; index < sampleCount; index++) {
    const input = original.slice(index * 4, index * 4 + 3);
    const light = luminance(input);
    for (const output of [hueUp, hueDown, gray]) {
      expect(
        Math.abs(luminance(output.slice(index * 4, index * 4 + 3)) - light),
      ).toBeLessThan(0.003);
    }
    if (index >= 8 && index <= 10) continue;
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs(gray[index * 4 + channel] - light)).toBeLessThan(0.003);
      expect(
        Math.abs(lighter[index * 4 + channel] - input[channel] * 2),
      ).toBeLessThan(0.006);
      expect(
        Math.abs(darker[index * 4 + channel] - input[channel] / 2),
      ).toBeLessThan(0.003);
    }
  }
  for (const index of [0, 1, 2, 3, 4, 7]) {
    for (let channel = 0; channel < 3; channel++) {
      expect(
        Math.abs(blue[index * 4 + channel] - original[index * 4 + channel]),
      ).toBeLessThan(0.003);
    }
  }
  const blueLight = luminance(original.slice(20, 23));
  for (const channel of blue.slice(20, 23)) {
    expect(Math.abs(channel - blueLight)).toBeLessThan(0.003);
  }
  expect(Math.max(...lighter.slice(44, 47))).toBeGreaterThan(4);
  expect(hueUp[1]).toBeGreaterThan(original[1]);
  expect(hueDown[2]).toBeGreaterThan(original[2]);
  for (let i = 0; i < 360; i++) {
    for (let channel = 0; channel < 3; channel++) {
      const a = red[(sampleCount + i) * 4 + channel];
      const b = red[(sampleCount + ((i + 1) % 360)) * 4 + channel];
      expect(Math.abs(a - b)).toBeLessThan(0.035);
    }
  }
});
