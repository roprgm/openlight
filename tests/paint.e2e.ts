import type { Page } from "@playwright/test";
import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box, choose, drag } from "./pointer";

const gray = [128, 128, 128, 255];

test.use({ viewport: { width: 1440, height: 1000 } });

const brushBar = (page: Page) =>
  page.getByRole("group", { name: "Layer options" });
const brushField = (page: Page, name: string) =>
  brushBar(page).getByRole("textbox", { name, exact: true });
const brushChip = (page: Page, name: string) =>
  brushBar(page).getByRole("button", { name, exact: true });

async function setBrush(page: Page, fields: Record<string, string>) {
  for (const [name, value] of Object.entries(fields)) {
    await brushField(page, name).fill(value);
    await brushField(page, name).press("Enter");
  }
}

/** Maps photo pixels, counted from the photo's center, to the page. */
async function photoToPage(page: Page) {
  const bounds = await box(page.getByRole("region", { name: "Image canvas" }));
  const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
  return (x: number, y: number) => [
    bounds.x + bounds.width / 2 + x * scale,
    bounds.y + bounds.height / 2 + y * scale,
  ];
}

/** Export pixels inside the strokes and far above them. */
async function samples(page: Page) {
  const { samples } = await readImage(page, undefined, [
    [600, 400],
    [600, 100],
  ]);
  return samples ?? [];
}

test("paint colors on a layer, swap them, erase, blend, and switch to a mask", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const kinds = async () =>
    (await page.evaluate(() => window.openlight.getState())).scene?.layers.map(
      (layer) => layer.kind,
    );
  await openPhoto(page);
  await page.getByRole("tab", { name: "Brush", exact: true }).click();
  const color = brushChip(page, "Color");
  const mask = brushChip(page, "Mask");
  await expect(mask).toHaveAttribute("aria-pressed", "true");
  await color.click();
  const canvas = page.getByLabel("Paint canvas", { exact: true });
  await expect(canvas).toBeVisible();
  // The untouched brush mask gives way to a paint layer.
  expect(await kinds()).toEqual(["image", "paint"]);
  await setBrush(page, { Size: "200" });
  const at = await photoToPage(page);
  const [from, to] = [at(-150, 0), at(150, 0)];
  await test.step("a stroke paints the primary color", async () => {
    await page.getByLabel("Primary color").fill("#ff0000");
    await drag(page, from, to, 16);
    expect(await samples(page)).toEqual([[255, 0, 0, 255], gray]);
  });
  await test.step("X swaps in the secondary color, white", async () => {
    await page.keyboard.press("x");
    await expect(page.getByLabel("Secondary color")).toHaveValue("#ff0000");
    await drag(page, from, to, 16);
    expect(await samples(page)).toEqual([[255, 255, 255, 255], gray]);
  });
  await test.step("Multiply by white leaves the image as it was", async () => {
    await choose(
      page,
      page.getByRole("combobox", { name: "Blend" }),
      "Multiply",
    );
    expect(await samples(page)).toEqual([gray, gray]);
    await page.keyboard.press("ControlOrMeta+z");
  });
  await test.step("Alt erases the paint, and undo brings it back", async () => {
    await page.keyboard.down("Alt");
    await drag(page, from, to, 16);
    await page.keyboard.up("Alt");
    expect(await samples(page)).toEqual([gray, gray]);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await samples(page)).toEqual([[255, 255, 255, 255], gray]);
  });
  await test.step("the mode follows the selected layer", async () => {
    await mask.click();
    await expect(
      page.getByLabel("Brush canvas", { exact: true }),
    ).toBeVisible();
    expect(await kinds()).toEqual(["image", "paint", "mask"]);
    // Choosing the paint layer leaves the tool, and the untouched mask with it; B paints on the layer again.
    await page
      .getByRole("button", { name: "Select Paint", exact: true })
      .click();
    expect(await kinds()).toEqual(["image", "paint"]);
    await page.keyboard.press("b");
    await expect(color).toHaveAttribute("aria-pressed", "true");
    await expect(canvas).toBeVisible();
    expect(await kinds()).toEqual(["image", "paint"]);
  });
});

/** The red channel's least and most along each displayed row, `rows` in page pixels. */
async function redRange(
  page: Page,
  rows: readonly number[],
  left: number,
  right: number,
) {
  const canvas = page
    .getByRole("region", { name: "Image canvas" })
    .locator("canvas");
  const origin = await box(canvas);
  const bytes = await canvas.screenshot();
  return page.evaluate(
    async ([bytes, rows, left, right]) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot read preview pixels.");
      context.drawImage(image, 0, 0);
      return rows.map((y) => {
        const { data } = context.getImageData(left, y, right - left, 1);
        const red = data.filter((_, i) => i % 4 === 0);
        return [Math.min(...red), Math.max(...red)];
      });
    },
    [
      [...bytes],
      rows.map((y) => Math.round(y - origin.y)),
      Math.round(left - origin.x),
      Math.round(right - origin.x),
    ] as const,
  );
}

/** Draws a light stroke across the photo in small moves; each row along it must show and stay within a level. */
async function expectSmoothStroke(page: Page, y: number) {
  await setBrush(page, { Size: "200", Flow: "40" });
  const at = await photoToPage(page);
  // Each small move stamps a dab or two, which used to round to 8 bits apart and leave rings.
  await drag(page, at(-300, y), at(300, y), 120);
  const rows = [0, 25, 50, 70].map((offset) => at(0, y + offset)[1]);
  const ranges = await redRange(page, rows, at(-100, 0)[0], at(100, 0)[0]);
  expect(ranges[0][0]).toBeGreaterThan(gray[0] + 20);
  for (const [least, most] of ranges) {
    expect(most - least).toBeLessThanOrEqual(1);
  }
}

test("light strokes drawn a little at a time come out smooth, on a mask and in color", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openPhoto(page);
  await page.getByRole("tab", { name: "Brush", exact: true }).click();
  await test.step("a mask brightens through its stroke", async () => {
    const exposure = page.getByRole("textbox", {
      name: "Exposure",
      exact: true,
    });
    await exposure.fill("2");
    await exposure.press("Enter");
    await expectSmoothStroke(page, -150);
  });
  await test.step("a paint layer lays red", async () => {
    await brushChip(page, "Color").click();
    await page.getByLabel("Primary color").fill("#ff0000");
    await expectSmoothStroke(page, 150);
  });
});

test("strokes settle into pixels, undo takes them back, and scenes keep them", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openPhoto(page);
  const layer = () =>
    page.evaluate(() => {
      const [, paint] = window.openlight.getState().scene?.layers ?? [];
      return paint?.kind === "paint"
        ? { raster: paint.raster, strokes: paint.strokes.length }
        : undefined;
    });
  // Short strokes down the image, red then blue, the last across the center.
  const paint = (from: number, to: number) =>
    page.evaluate(
      ([from, to]) => {
        const [, layer] = window.openlight.getState().scene?.layers ?? [];
        const id = layer?.id ?? window.openlight.addLayer("paint");
        for (let i = from; i < to; i++) {
          const x = i === 99 ? 580 : 100 + (i % 10) * 100;
          const y = i === 99 ? 400 : 80 + Math.floor(i / 10) * 60;
          window.openlight.addPaintStroke(id, {
            mode: "paint",
            size: 30,
            feather: 0.5,
            flow: 1,
            color: i === 99 ? "#0000ff" : "#ff0000",
            points: [
              [x, y, 1],
              [x + 40, y, 1],
            ],
          });
        }
      },
      [from, to] as const,
    );
  await paint(0, 99);
  expect(await layer()).toEqual({ raster: undefined, strokes: 99 });
  const before = await samples(page);
  expect(before[0]).toEqual(gray);

  await test.step("the hundredth stroke settles every stroke into pixels", async () => {
    await paint(99, 100);
    await expect.poll(layer).toMatchObject({ strokes: 0 });
    expect((await layer())?.raster).toEqual(expect.any(String));
    const settled = await samples(page);
    expect(settled[0][2]).toBeGreaterThan(200);
    expect(settled[1]).toEqual(before[1]);
  });

  await test.step("undo goes back to the strokes, and redo to the pixels", async () => {
    const settled = await samples(page);
    await page.evaluate(() => window.openlight.undo());
    expect(await layer()).toEqual({ raster: undefined, strokes: 99 });
    expect(await samples(page)).toEqual(before);
    await page.evaluate(() => window.openlight.redo());
    expect(await samples(page)).toEqual(settled);
  });

  await test.step("a stroke over the pixels undoes by loading them again", async () => {
    const settled = await samples(page);
    await paint(100, 101);
    expect((await layer())?.strokes).toBe(1);
    await page.evaluate(() => window.openlight.undo());
    expect(await samples(page)).toEqual(settled);
  });

  await test.step("a scene file keeps the pixels", async () => {
    const settled = await samples(page);
    const raster = (await layer())?.raster;
    await page.evaluate(async () => {
      const scene = await window.openlight.exportScene();
      await window.openlight.openFile(scene);
    });
    await expect.poll(layer).toEqual({ raster, strokes: 0 });
    expect(await samples(page)).toEqual(settled);
  });
});

test("a brush mask settles into pixels like paint, and undo and scene files keep them", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openPhoto(page);
  const mask = () =>
    page.evaluate(() => {
      const [, layer] = window.openlight.getState().scene?.layers ?? [];
      return layer?.kind === "mask" && layer.mask.kind === "brush"
        ? { raster: layer.mask.raster, strokes: layer.mask.strokes.length }
        : undefined;
    });
  // Short strokes down the image, through a mask that brightens by a stop.
  const paint = (count: number) =>
    page.evaluate((count) => {
      const api = window.openlight;
      const [, layer] = api.getState().scene?.layers ?? [];
      const id = layer?.id ?? api.addLayer("mask");
      api.setLayerMask(id, {
        kind: "brush",
        strokes: Array.from({ length: count }, (_, i) => {
          const [x, y] = [100 + (i % 10) * 100, 80 + Math.floor(i / 10) * 60];
          return {
            mode: "paint" as const,
            size: 30,
            feather: 0.5,
            flow: 1,
            points: [
              [x, y, 1],
              [x + 40, y, 1],
            ] as [number, number, number][],
          };
        }),
      });
      api.setAdjustments({ exposure: 1 }, id);
    }, count);
  const inside = async () =>
    (await readImage(page, undefined, [[620, 80]])).samples?.[0];
  await paint(99);
  expect(await mask()).toEqual({ raster: undefined, strokes: 99 });
  const before = await inside();
  expect(before?.[0]).toBeGreaterThan(gray[0] + 20);
  await paint(100);
  await expect.poll(mask).toMatchObject({ strokes: 0 });
  const raster = (await mask())?.raster;
  expect(raster).toEqual(expect.any(String));
  expect(await inside()).toEqual(before);
  await page.evaluate(() => window.openlight.undo());
  expect(await mask()).toEqual({ raster: undefined, strokes: 99 });
  await page.evaluate(() => window.openlight.redo());
  expect(await mask()).toEqual({ raster, strokes: 0 });
  expect(await inside()).toEqual(before);
  await page.evaluate(async () => {
    const scene = await window.openlight.exportScene();
    await window.openlight.openFile(scene);
  });
  await expect.poll(mask).toEqual({ raster, strokes: 0 });
  expect(await inside()).toEqual(before);
});

test("Photoshop's keys switch the brush, its colors, feather, flow, and opacity", async ({
  page,
}) => {
  await openPhoto(page);
  const field = (name: string) => brushField(page, name);
  const chip = (name: string) => brushChip(page, name);
  await page.keyboard.press("b");
  await expect(chip("Mask")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("b");
  await expect(chip("Color")).toHaveAttribute("aria-pressed", "true");

  const primary = page.getByLabel("Primary color");
  await primary.fill("#ff0000");
  await page.keyboard.press("d");
  await expect(primary).toHaveValue("#000000");

  await page.keyboard.press("Shift+BracketRight");
  await expect(field("Feather")).toHaveValue("60");
  await page.keyboard.press("5");
  await expect(field("Flow")).toHaveValue("50");
  await page.keyboard.press("Shift+Digit3");
  await expect(field("Opacity")).toHaveValue("30");

  // On a mask, X paints or erases, as black and white do in Photoshop.
  await page.keyboard.press("b");
  await expect(chip("Mask")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("x");
  await expect(chip("Erase")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("x");
  await expect(chip("Paint")).toHaveAttribute("aria-pressed", "true");
});

for (const [mode, action] of [
  ["paint", "append"],
  ["mask", "append"],
  ["paint", "undo"],
  ["paint", "close"],
] as const) {
  test(`${mode} settling remains atomic when ${action} happens during readback`, async ({
    page,
  }) => {
    await page.goto("/tests/gpu.html");
    const result = await page.evaluate(
      async ({ mode, action }) => {
        const path = "/tests/settle-gpu.ts";
        const { editDuringSettle } = (await import(
          path
        )) as typeof import("./settle-gpu");
        return editDuringSettle(mode, action);
      },
      { mode, action },
    );
    expect(result.errors).toEqual([]);
    expect(result.historyUnchanged).toBe(true);
    expect(result.accepted).toBe(action === "append");
    if (action !== "close") {
      expect(result.error).toBeLessThan(0.002);
    }
    if (action === "append") {
      expect(result.raster).toEqual(expect.any(String));
      expect(result.strokes).toBe(1);
      expect(result.stamped).toBe(101);
    } else {
      expect(result.unchanged).toBe(true);
      expect(result.raster).toBeUndefined();
      expect(result.strokes).toBe(action === "undo" ? 99 : 100);
    }
  });
}

test("photo exposure, contrast, and curves leave the selected paint color unchanged", async ({
  page,
}) => {
  await openPhoto(page);
  await page.evaluate(() => {
    const api = window.openlight;
    api.setAdjustments({ exposure: 3, contrast: 97 });
    api.setToneCurve([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.8 },
      { x: 1, y: 1 },
    ]);
    const id = api.addLayer("paint");
    api.addPaintStroke(id, {
      color: "#b95050",
      mode: "paint",
      size: 791,
      feather: 0.5,
      flow: 1,
      points: [[600, 400, 1]],
    });
  });
  expect((await samples(page))[0]).toEqual([185, 80, 80, 255]);
});

test("deleting a paint layer at the limit lets the brush paint again", async ({
  page,
}) => {
  await openPhoto(page);
  await page.evaluate(() => {
    const api = window.openlight;
    for (let i = 0; i < 4; i++) {
      const id = api.addLayer("paint");
      api.setLayer(id, { name: `Paint ${i + 1}` });
    }
    const scene = api.getState().scene;
    if (!scene) throw Error("No photo loaded.");
    api.selectLayer(scene.layers[0].id);
  });
  await page.getByRole("tab", { name: "Brush", exact: true }).click();
  await brushChip(page, "Color").click();
  await expect(
    page.getByText(/A photo holds up to 4 paint layers/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Paint 1 actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByLabel("Primary color").fill("#ff0000");
  const at = await photoToPage(page);
  await drag(page, at(-20, 0), at(20, 0));
  expect((await samples(page))[0]).toEqual([255, 0, 0, 255]);
});

test("at the mask limit, nesting another brush is unavailable", async ({
  page,
}) => {
  await openPhoto(page);
  await page.evaluate(() => {
    const api = window.openlight;
    for (let i = 0; i < 10; i++) {
      const id = api.addLayer("mask");
      api.setLayerMask(id, { kind: "brush", strokes: [] });
      api.setLayer(id, { name: `Mask ${i + 1}` });
    }
  });
  await page
    .getByRole("button", { name: "Mask 1 actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Add to mask", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Brush", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "Linear gradient", exact: true }),
  ).toBeEnabled();
});
