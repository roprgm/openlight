import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box, choose } from "./pointer";

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

test("luminance and color ranges select tones and a picked color", async ({
  page,
}) => {
  await open(page);
  const original = await quadrantColors(page);
  const addEffect = (name: string) =>
    test.step(`add ${name}`, async () => {
      await page
        .getByRole("button", { name: "Add effect", exact: true })
        .click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    });

  await addEffect("Luminance Range");
  await expect(
    page.getByRole("button", { name: "Mask overlay", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await setField(page, "Low", "75");
  await setField(page, "Smoothness", "5");
  await setField(page, "Exposure", "-2");
  const darkened = await quadrantColors(page);
  expect(darkened.light[0]).toBeLessThan(original.light[0] - 60);
  expect({ ...darkened, light: original.light }).toEqual(original);

  // Without a range the mask covers the whole photo.
  await choose(page, page.getByRole("combobox", { name: "Range" }), "None");
  expect((await quadrantColors(page)).dark[0]).toBeLessThan(original.dark[0]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await quadrantColors(page)).toEqual(darkened);

  await addEffect("Color Range");
  const picker = page.getByRole("application", {
    name: "Pick a color from the photo",
  });
  await expect(picker).toContainText("Click the photo to pick the color");
  const canvas = await box(picker);
  // Just past the center, on the orange quadrant, whatever the zoom.
  await page.mouse.click(
    canvas.x + canvas.width / 2 + 20,
    canvas.y + canvas.height / 2 + 20,
  );
  await expect(picker).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: /^Color #/ }),
  ).toHaveAccessibleName("Color #e07020");
  await setField(page, "Saturation", "-100");
  const gray = await quadrantColors(page);
  expect(Math.abs(gray.orange[0] - gray.orange[2])).toBeLessThan(12);
  expect({ ...gray, orange: darkened.orange }).toEqual(darkened);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await quadrantColors(page)).toEqual(darkened);
});

test("a range narrows gradient and brush masks to the pixels it selects", async ({
  page,
}) => {
  await open(page);
  const original = await quadrantColors(page);
  const light = {
    kind: "luminance",
    low: 75,
    high: 100,
    smoothness: 5,
  } as const;
  // The right half, light above orange: only the light quadrant is in range.
  const id = await page.evaluate(
    (range) =>
      window.openlight.run({
        type: "add-mask",
        mask: { kind: "linear", start: [101, 100], end: [99, 100] },
        range,
        adjustments: { exposure: -2 },
      }).layerId ?? "",
    light,
  );
  const gradient = await quadrantColors(page);
  expect(gradient.light[0]).toBeLessThan(original.light[0] - 60);
  expect({ ...gradient, light: original.light }).toEqual(original);

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
  const brush = await quadrantColors(page);
  expect(brush.light[0]).toBeLessThan(original.light[0] - 60);
  expect({ ...brush, light: original.light }).toEqual(original);
});
