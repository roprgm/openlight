import type { Locator } from "@playwright/test";
import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box, drag } from "./pointer";

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

test("color mixer switches channels, groups vertical drags, exports selected colors and resets", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  // Base UI keeps a slider's range input inside its thumb, on the bar a person drags.
  const bar = (slider: Locator) =>
    slider.locator('xpath=ancestor::*[@data-slot="slider-track"]');
  await openPhoto(page);
  await page.getByRole("button", { name: "Add effect", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Color Mixer", exact: true })
    .click();
  const before = (await state()).history.undoCount;
  const hue = page.getByRole("slider", { name: "Blue hue", exact: true });
  await hue.scrollIntoViewIfNeeded();
  await expect(hue).toHaveAttribute("aria-orientation", "vertical");
  await hue.press("ArrowUp");
  await expect(hue).toHaveValue("1");
  expect((await state()).history.undoCount).toBe(before + 1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(hue).toHaveValue("0");
  const beforeTabs = await state();
  await page.getByRole("tab", { name: "Hue", exact: true }).press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Saturation", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(await state()).toEqual(beforeTabs);
  const saturation = page.getByRole("slider", {
    name: "Blue saturation",
    exact: true,
  });
  const track = await box(bar(saturation));
  await drag(
    page,
    [track.x + track.width / 2, track.y + track.height / 2],
    [track.x + track.width / 2, track.y + track.height / 4],
  );
  const dragged = (await state()).colorMixer.saturation[5];
  expect(dragged).toBeGreaterThan(0);
  expect((await state()).history.undoCount).toBe(before + 1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(saturation).toHaveValue("0");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(saturation).toHaveValue(String(dragged));
  const numeric = page.getByRole("textbox", {
    name: "Blue saturation value",
    exact: true,
  });
  await numeric.fill("-100");
  await numeric.press("Enter");
  await expect(saturation).toHaveValue("-100");
  const { samples } = await readImage(page, undefined, [[350, 200]]);
  const pixel = samples?.[0] ?? [];
  for (const channel of pixel.slice(0, 3)) {
    expect(Math.abs(channel - 79)).toBeLessThanOrEqual(2);
  }
  expect(pixel[3]).toBe(255);
  await page.getByRole("tab", { name: "Luminance", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Blue luminance", exact: true }),
  ).toHaveValue("0");
  await page.getByRole("tab", { name: "Saturation", exact: true }).click();
  await expect(saturation).toHaveValue("-100");
  await saturation.locator("..").dblclick();
  await expect(saturation).toHaveValue("0");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(saturation).toHaveValue("-100");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(saturation).toHaveValue("0");
});
