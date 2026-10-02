import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box, drag } from "./pointer";

function luminance(rgb: number[]) {
  return rgb[0] * 0.2627 + rgb[1] * 0.678 + rgb[2] * 0.0593;
}

function expectClose(actual: number[], expected: number[], tolerance = 0.003) {
  for (const [i, value] of expected.entries()) {
    expect(Math.abs(actual[i] - value)).toBeLessThan(tolerance);
  }
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
  const rgb = (output: number[], index: number) =>
    output.slice(index * 4, index * 4 + 3);
  const alpha = (output: number[]) => output.filter((_, i) => i % 4 === 3);
  const [neutral, hue, gray, lighter, blue, red] = outputs;
  expect(neutral).toEqual(original);
  for (const output of outputs) {
    expect(output.every(Number.isFinite)).toBe(true);
    expect(alpha(output)).toEqual(alpha(original));
    // Transparent black, mid gray, and HDR white have no color to mix.
    expect(output.slice(32, 44)).toEqual(original.slice(32, 44));
  }
  for (let index = 0; index < sampleCount; index++) {
    if (index >= 8 && index <= 10) continue;
    const input = rgb(original, index);
    const light = luminance(input);
    expect(Math.abs(luminance(rgb(hue, index)) - light)).toBeLessThan(0.003);
    expectClose(rgb(gray, index), [light, light, light]);
    expectClose(
      rgb(lighter, index),
      input.map((value) => value * 2),
      0.006,
    );
  }
  for (const index of [0, 1, 2, 3, 4, 7]) {
    expectClose(rgb(blue, index), rgb(original, index));
  }
  const blueLight = luminance(rgb(original, 5));
  expectClose(rgb(blue, 5), [blueLight, blueLight, blueLight]);
  expect(Math.max(...rgb(lighter, 11))).toBeGreaterThan(4);
  expect(hue[1]).toBeGreaterThan(original[1]);
  for (let i = 0; i < 360; i++) {
    const next = sampleCount + ((i + 1) % 360);
    expectClose(rgb(red, sampleCount + i), rgb(red, next), 0.035);
  }
});

test("color mixer drags a vertical slider as one step, exports the selected color, and resets", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  await openPhoto(page);
  await page.getByRole("button", { name: "Add effect", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Color Mixer", exact: true })
    .click();
  const before = (await state()).history.undoCount;
  await page.getByRole("tab", { name: "Saturation", exact: true }).click();
  const saturation = page.getByRole("slider", {
    name: "Blue saturation",
    exact: true,
  });
  await saturation.scrollIntoViewIfNeeded();
  // Base UI keeps a slider's range input inside its thumb, on the bar a person drags.
  const track = await box(
    saturation.locator('xpath=ancestor::*[@data-slot="slider-track"]'),
  );
  const x = track.x + track.width / 2;
  await drag(
    page,
    [x, track.y + track.height / 2],
    [x, track.y + track.height / 4],
  );
  expect((await state()).colorMixer.saturation[5]).toBeGreaterThan(0);
  expect((await state()).history.undoCount).toBe(before + 1);
  const numeric = page.getByRole("textbox", {
    name: "Blue saturation value",
    exact: true,
  });
  await numeric.fill("-100");
  await numeric.press("Enter");
  const { samples } = await readImage(page, undefined, [[350, 200]]);
  const pixel = samples?.[0] ?? [];
  expect(pixel).toHaveLength(4);
  for (const channel of pixel.slice(0, 3)) {
    expect(Math.abs(channel - 79)).toBeLessThanOrEqual(2);
  }
  await saturation.locator("..").dblclick();
  await expect(saturation).toHaveValue("0");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(saturation).toHaveValue("-100");
});
