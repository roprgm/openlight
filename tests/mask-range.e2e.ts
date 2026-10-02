import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box } from "./pointer";

// Dark and light grays over blue and orange, whose lightness falls between them.
const quadrants = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="100" height="100" fill="#303030"/>
    <rect x="100" width="100" height="100" fill="#d0d0d0"/>
    <rect y="100" width="100" height="100" fill="#2060d0"/>
    <rect x="100" y="100" width="100" height="100" fill="#e07020"/>
  </svg>`,
);

async function open(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "quadrants.svg",
    mimeType: "image/svg+xml",
    buffer: quadrants,
  });
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
}

/** The exported dark, light, blue, and orange quadrants. */
async function quadrantColors(page: Page) {
  const { samples } = await readImage(page, undefined, [
    [50, 50],
    [150, 50],
    [50, 150],
    [150, 150],
  ]);
  const [dark, light, blue, orange] = samples ?? [];
  return { dark, light, blue, orange };
}

async function setField(page: Page, name: string, value: string) {
  const field = page.getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

async function addEffect(page: Page, name: string) {
  await page.getByRole("button", { name: "Add effect", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

test("luminance and color range masks select tones and a picked color", async ({
  page,
}) => {
  await open(page);
  const original = await quadrantColors(page);

  await addEffect(page, "Luminance Range");
  await expect(
    page.getByRole("button", { name: "Mask overlay", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await setField(page, "Low", "75");
  await setField(page, "Smoothness", "5");
  await setField(page, "Exposure", "-2");
  const darkened = await quadrantColors(page);
  expect(darkened.light[0]).toBeLessThan(original.light[0] - 60);
  expect({ ...darkened, light: original.light }).toEqual(original);

  await addEffect(page, "Color Range");
  const picker = page.getByRole("application", { name: "Color range canvas" });
  await expect(picker).toContainText("drag over the photo to pick the color");
  const canvas = await box(picker);
  // Just past the center, on the orange and blue quadrants, whatever the zoom.
  const orange = [
    canvas.x + canvas.width / 2 + 20,
    canvas.y + canvas.height / 2 + 20,
  ];
  const blue = [
    canvas.x + canvas.width / 2 - 20,
    canvas.y + canvas.height / 2 + 20,
  ];
  const color = page.getByLabel("Range color", { exact: true });
  await page.mouse.click(orange[0], orange[1]);
  await expect(color).toHaveValue("#e07020");
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await setField(page, "Saturation", "-100");
  const gray = await quadrantColors(page);
  expect(Math.abs(gray.orange[0] - gray.orange[2])).toBeLessThan(12);
  expect({ ...gray, orange: darkened.orange }).toEqual(darkened);

  // Picking again reads the photo below the mask, so its own edit doesn't change the color.
  await page
    .getByRole("button", { name: "Pick a color from the photo", exact: true })
    .click();
  await page.mouse.click(orange[0], orange[1]);
  await expect(color).toHaveValue("#e07020");
  // A drag keeps picking, as one edit.
  await page.mouse.move(orange[0], orange[1]);
  await page.mouse.down();
  await page.mouse.move(blue[0], blue[1], { steps: 4 });
  await page.mouse.up();
  await expect(color).toHaveValue("#2060d0");
  const recolored = await quadrantColors(page);
  expect(Math.abs(recolored.blue[0] - recolored.blue[2])).toBeLessThan(12);
  expect(recolored.orange).toEqual(darkened.orange);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(color).toHaveValue("#e07020");
  expect(await quadrantColors(page)).toEqual(gray);
});

test("a range intersects, or is shaped by, gradient and brush masks", async ({
  page,
}) => {
  await open(page);
  const original = await quadrantColors(page);
  const darkened = (colors: Awaited<ReturnType<typeof quadrantColors>>) =>
    Object.entries(colors)
      .filter(([name, color]) => color[0] < original[name as "light"][0] - 40)
      .map(([name]) => name);
  // The right half, light above orange: intersected with the light tones, only the light quadrant.
  const id = await page.evaluate(() => {
    const api = window.openlight;
    const id = api.addLayer("mask");
    api.setLayerMask(id, {
      kind: "linear",
      start: [101, 100],
      end: [99, 100],
    });
    api.setAdjustments({ exposure: -2 }, id);
    return id;
  });
  await page
    .getByRole("button", { name: "Linear Gradient actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Intersect with mask", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Luminance range", exact: true })
    .click();
  await setField(page, "Low", "75");
  await setField(page, "Smoothness", "5");
  expect(darkened(await quadrantColors(page))).toEqual(["light"]);

  // A brush over the right half, intersected the same way.
  await page.evaluate((id) => {
    window.openlight.setLayerMask(id, {
      kind: "brush",
      strokes: [
        {
          mode: "paint",
          size: 100,
          feather: 0,
          flow: 1,
          points: [
            [150, -50, 1],
            [150, 250, 1],
          ],
        },
      ],
    });
  }, id);
  expect(darkened(await quadrantColors(page))).toEqual(["light"]);

  // The light and orange tones, less a gradient over the bottom half: the light quadrant again.
  await page.evaluate((id) => {
    const api = window.openlight;
    api.setLayerMask(id, {
      kind: "luminance-range",
      low: 50,
      high: 100,
      smoothness: 5,
    });
    const [range] = api.getState().scene?.layers.at(-1)?.children ?? [];
    api.setLayerMask(range.id, {
      kind: "linear",
      start: [100, 101],
      end: [100, 99],
    });
    api.setMaskOperation(range.id, "subtract");
  }, id);
  expect(darkened(await quadrantColors(page))).toEqual(["light"]);
});

test("an unpicked color range has no coverage, including as an intersection", async ({
  page,
}) => {
  await open(page);
  const original = await quadrantColors(page);
  await addEffect(page, "Color Range");
  const state = await page.evaluate(() => window.openlight.getState());
  expect(state.scene?.layers.at(-1)).toMatchObject({
    kind: "mask",
    mask: { kind: "color-range", color: null },
  });
  expect(state.selectedLayerId).toBe(state.scene?.layers.at(-1)?.id);
  await expect(page.getByLabel("Range color")).toHaveCount(0);
  await setField(page, "Exposure", "-2");
  expect(await quadrantColors(page)).toEqual(original);
  await page.keyboard.press("Escape");

  const { parent, child } = await page.evaluate(() => {
    const api = window.openlight;
    const parent = api.addLayer("mask");
    api.setLayerMask(parent, {
      kind: "linear",
      start: [101, 100],
      end: [99, 100],
    });
    api.setAdjustments({ exposure: -2 }, parent);
    const child = api.addLayer("mask", { inside: parent });
    api.setLayerMask(child, {
      kind: "color-range",
      color: null,
      tolerance: 30,
    });
    api.setMaskOperation(child, "intersect");
    return { parent, child };
  });
  expect(await quadrantColors(page)).toEqual(original);
  await page.evaluate(
    (id) => window.openlight.setMaskOperation(id, "subtract"),
    child,
  );
  const subtracted = await quadrantColors(page);
  expect(subtracted.light[0]).toBeLessThan(original.light[0] - 60);
  expect(subtracted.orange[0]).toBeLessThan(original.orange[0] - 60);
  await page.evaluate(
    (id) => window.openlight.setMaskOperation(id, "add"),
    child,
  );
  expect(await quadrantColors(page)).toEqual(subtracted);
  await page.evaluate((id) => window.openlight.deleteLayer(id), parent);
});
