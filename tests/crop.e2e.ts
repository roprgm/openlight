import type { Page } from "@playwright/test";
import { expect, openPhoto, test } from "./fixtures";
import { readImage } from "./images";
import { box, choose, drag, zoom } from "./pointer";

/** Where API.md puts the point Vertical −50 sends to infinity: 1 / (0.0045 · 50) half-heights above the center. */
const vanishing = 400 - 400 / (0.0045 * 50);
const dot = [698, 520] as const;
/** Black lines that meet above the photo, as a building's edges do when the camera tilts up, and a blue dot between two. */
const keystone = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <rect width="1200" height="800" fill="white"/>
    ${[150, 375, 600, 825, 1050]
      .map(
        (x) =>
          `<line x1="${x}" y1="800" x2="600" y2="${vanishing}" stroke="black" stroke-width="12"/>`,
      )
      .join("")}
    <circle cx="${dot[0]}" cy="${dot[1]}" r="24" fill="blue"/>
  </svg>`,
);

async function openKeystone(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "keystone.svg",
    mimeType: "image/svg+xml",
    buffer: keystone,
  });
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
}

/** Sets Vertical or Horizontal in the Crop panel and applies it. */
async function correct(
  page: Page,
  name: "Vertical" | "Horizontal",
  value: string,
) {
  const crop = page.getByRole("group", { name: "Crop" });
  const field = crop.getByRole("textbox", { name, exact: true });
  await page.keyboard.press("c");
  await field.fill(value);
  await field.press("Tab");
  await expect(field).toHaveValue(value);
  await crop.getByRole("button", { name: "Apply crop" }).click();
  await expect(crop).toBeHidden();
}

/** Centers of the dark lines across exported rows, or down columns with `axis` 1, at fractions of the image. */
async function lines(page: Page, fractions: readonly number[], axis = 0) {
  return page.evaluate(
    async ([fractions, axis]) => {
      const image = await createImageBitmap(
        await window.openlight.exportImage(),
      );
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot read image pixels.");
      context.drawImage(image, 0, 0);
      const length = axis ? image.height : image.width;
      return fractions.map((fraction) => {
        const at = Math.round(fraction * (axis ? image.width : image.height));
        const { data } = axis
          ? context.getImageData(at, 0, 1, length)
          : context.getImageData(0, at, length, 1);
        const centers: number[] = [];
        let start = -1;
        for (let i = 0; i <= length; i++) {
          const dark = i < length && data[i * 4] < 128 && data[i * 4 + 2] < 128;
          if (dark && start < 0) start = i;
          if (!dark && start >= 0) {
            centers.push((start + i - 1) / 2);
            start = -1;
          }
        }
        return centers;
      });
    },
    [fractions, axis] as const,
  );
}

function expectParallel([first, second]: number[][]) {
  expect(first.length).toBeGreaterThanOrEqual(3);
  expect(second).toHaveLength(first.length);
  for (const [i, center] of first.entries()) {
    expect(Math.abs(center - second[i])).toBeLessThan(1.5);
  }
}

/** The blue dot's center on the page, as the canvas shows it. */
async function dotOnPage(page: Page) {
  const canvas = page
    .getByRole("region", { name: "Image canvas" })
    .locator("canvas");
  const origin = await box(canvas);
  const bytes = await canvas.screenshot();
  const [x, y] = await page.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot read preview pixels.");
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      let [sx, sy, count] = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 2] > 200 && data[i] < 80 && data[i + 1] < 80) {
          sx += ((i / 4) % image.width) + 0.5;
          sy += Math.floor(i / 4 / image.width) + 0.5;
          count++;
        }
      }
      return [sx / count, sy / count];
    },
    [...bytes],
  );
  return [origin.x + x, origin.y + y] as const;
}

/** In the export, the blue dot's center and that of the dark paint within the dot's bounds. */
async function paintOnDot(page: Page) {
  return page.evaluate(async () => {
    const image = await createImageBitmap(await window.openlight.exportImage());
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot read image pixels.");
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(
      0,
      0,
      image.width,
      image.height,
    );
    function centroid(
      matches: (i: number) => boolean,
      [left, top, right, bottom]: readonly number[] = [0, 0, width, height],
    ) {
      let [sx, sy, count] = [0, 0, 0];
      const bounds = [width, height, 0, 0];
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          if (!matches((y * width + x) * 4)) continue;
          sx += x + 0.5;
          sy += y + 0.5;
          count++;
          bounds[0] = Math.min(bounds[0], x);
          bounds[1] = Math.min(bounds[1], y);
          bounds[2] = Math.max(bounds[2], x + 1);
          bounds[3] = Math.max(bounds[3], y + 1);
        }
      }
      return { center: [sx / count, sy / count], bounds };
    }
    const blue = centroid(
      (i) => data[i + 2] > 200 && data[i] < 80 && data[i + 1] < 80,
    );
    const paint = centroid(
      (i) => data[i] < 80 && data[i + 1] < 80 && data[i + 2] < 80,
      blue.bounds,
    );
    return { dot: blue.center, paint: paint.center };
  });
}

function distance(a: readonly number[], b: readonly number[]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

test("crop, rotate, flip and straighten the photo, then undo", async ({
  page,
}) => {
  const state = () => page.evaluate(() => window.openlight.getState());
  await openPhoto(page);
  const initial = await state();
  const open = page.getByRole("tab", { name: "Crop" });
  const panel = page.getByRole("region", { name: "Crop tool" });
  const selection = page.getByRole("application", { name: "Crop selection" });
  const apply = page.getByRole("button", { name: "Apply crop" });
  const reset = page
    .getByRole("group", { name: "Crop" })
    .getByRole("button", { name: "Reset", exact: true });
  const aspect = panel.getByRole("combobox", { name: "Aspect ratio" });

  await test.step("Escape discards a draft", async () => {
    await open.click();
    await choose(page, aspect, "Square");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    expect(await state()).toEqual(initial);
  });

  await test.step("a square crop resized by its edge and moved applies as one edit", async () => {
    await page.keyboard.press("c");
    await choose(page, aspect, "Square");
    const edge = await box(
      page.getByRole("button", { name: "Resize crop right", exact: true }),
    );
    const x = edge.x + edge.width / 2;
    const y = edge.y + edge.height / 2;
    await drag(page, [x, y], [x - 60, y]);
    const bounds = await box(selection);
    await drag(
      page,
      [bounds.x + bounds.width / 2, y],
      [bounds.x + bounds.width / 2 + 300, y],
    );
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    const cropped = await readImage(page);
    expect(cropped.size[0]).toBe(cropped.size[1]);
    expect(cropped.size[0]).toBeLessThan(800);
    expect(cropped.corner).toEqual([0, 0, 0, 255]);
    expect((await state()).history.undoCount).toBe(1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await readImage(page)).size).toEqual([1200, 800]);
  });

  await test.step("a quarter turn swaps the size and a flip mirrors it", async () => {
    await open.click();
    await panel
      .getByRole("button", { name: "Rotate counterclockwise" })
      .click();
    await panel.getByRole("button", { name: "Flip vertical" }).click();
    await apply.click();
    expect(await readImage(page)).toEqual({
      size: [800, 1200],
      center: [128, 128, 128, 255],
      corner: [0, 0, 0, 255],
    });
  });

  await test.step("a drag outside the crop straightens it, and reset restores the photo", async () => {
    await open.click();
    await reset.click();
    await page.getByRole("button", { name: "Move crop" }).hover();
    await zoom(page, 0.5);
    const bounds = await box(selection);
    const x = bounds.x + bounds.width + 40;
    const y = bounds.y + bounds.height / 2;
    const rise = (bounds.width / 2 + 40) * Math.tan(Math.PI / 6);
    await drag(page, [x, y], [x, y + rise]);
    await apply.click();
    expect((await state()).frame?.angle).toBeCloseTo(30, 0);
    expect(await readImage(page)).toEqual({
      size: [1200, 800],
      center: [128, 128, 128, 255],
      corner: [32, 32, 32, 255],
    });
    await open.click();
    await reset.click();
    await apply.click();
    expect((await state()).frame).toEqual(initial.frame);
  });
});

/** The stored draft's frame, read straight from IndexedDB. */
function savedFrame(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const opening = indexedDB.open("openlight", 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const request = database
            .transaction("draft")
            .objectStore("draft")
            .get("latest");
          request.onsuccess = () => {
            database.close();
            resolve(request.result?.scene.scene.frame);
          };
        };
      }),
  );
}

test("perspective makes converging lines parallel and stays with the photo through undo, turns, flips, scene files, and drafts", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const state = () => page.evaluate(() => window.openlight.getState());
  await openKeystone(page);
  const initial = await state();
  const crop = page.getByRole("group", { name: "Crop" });
  const vertical = crop.getByRole("textbox", { name: "Vertical", exact: true });
  const horizontal = crop.getByRole("textbox", {
    name: "Horizontal",
    exact: true,
  });

  await test.step("the lines converge toward the top", async () => {
    const [top, bottom] = await lines(page, [0.25, 0.75]);
    expect(top).toHaveLength(5);
    expect(bottom).toHaveLength(5);
    expect(top[0] - bottom[0]).toBeGreaterThan(30);
  });

  await test.step("Escape discards a correction without an edit", async () => {
    await page.keyboard.press("c");
    await vertical.fill("-50");
    await vertical.press("Tab");
    await page.keyboard.press("Escape");
    await expect(crop).toBeHidden();
    expect(await state()).toEqual(initial);
  });

  await test.step("Enter commits a typed Vertical and keeps Crop open; Enter again applies it", async () => {
    await page.keyboard.press("c");
    await vertical.fill("-50");
    await vertical.press("Enter");
    await expect(vertical).toHaveValue("-50");
    await expect(crop).toBeVisible();
    expect((await state()).frame).toEqual(initial.frame);
    await page.keyboard.press("Enter");
    await expect(crop).toBeHidden();
  });

  await test.step("Vertical −50 makes the lines parallel as one edit, at the photo's size", async () => {
    const { frame, history } = await state();
    expect(frame?.perspective).toEqual([0, -50]);
    expect(history.undoCount).toBe(1);
    expect((await readImage(page)).size).toEqual([1200, 800]);
    expectParallel(await lines(page, [0.25, 0.75]));
  });

  await test.step("undo restores the photo's frame, and redo the correction", async () => {
    await page.keyboard.press("ControlOrMeta+z");
    expect((await state()).frame).toEqual(initial.frame);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect((await state()).frame?.perspective).toEqual([0, -50]);
  });

  await test.step("a quarter turn and a flip carry the correction, shown along the displayed axes", async () => {
    await page.keyboard.press("c");
    await expect(vertical).toHaveValue("-50");
    await crop.getByRole("button", { name: "Rotate clockwise" }).click();
    // The photo's top, which the correction enlarges, now shows on the right, then on the left.
    await expect(vertical).toHaveValue("0");
    await expect(horizontal).toHaveValue("50");
    await crop.getByRole("button", { name: "Flip horizontal" }).click();
    await expect(horizontal).toHaveValue("-50");
    await crop.getByRole("button", { name: "Apply crop" }).click();
    expect((await state()).frame?.perspective).toEqual([0, -50]);
    expect((await readImage(page)).size).toEqual([800, 1200]);
    expectParallel(await lines(page, [0.25, 0.75], 1));
  });

  await test.step("a scene file and the draft reopen with the correction", async () => {
    const corrected = await state();
    const shown = await lines(page, [0.25, 0.75], 1);
    await page.evaluate(async () => {
      const api = window.openlight;
      await api.loadScene(await api.exportScene());
    });
    const reopened = await state();
    expect(reopened.documentId).not.toBe(corrected.documentId);
    expect(reopened.frame).toEqual(corrected.frame);
    expect(await lines(page, [0.25, 0.75], 1)).toEqual(shown);
    await expect.poll(() => savedFrame(page)).toEqual(corrected.frame);
    await page.reload();
    await page.getByRole("button", { name: "Recover", exact: true }).click();
    await expect
      .poll(async () => (await state()).frame)
      .toEqual(corrected.frame);
  });
});

test("brush, retouch, and color picks land where the corrected photo shows them, and paint stays there", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const state = () => page.evaluate(() => window.openlight.getState());
  const layers = async () => (await state()).scene?.layers ?? [];
  await openKeystone(page);
  await correct(page, "Vertical", "-50");

  await test.step("a color range picks the dot's blue", async () => {
    const at = await dotOnPage(page);
    await page.getByRole("button", { name: "Add effect" }).click();
    await page.getByRole("menuitem", { name: "Color Range" }).click();
    await page.mouse.click(at[0], at[1]);
    const color = page.getByLabel("Range color");
    await expect(color).toHaveValue(/^#[0-9a-f]{6}$/);
    const hex = await color.inputValue();
    const [red, green, blue] = [1, 3, 5].map((i) =>
      Number.parseInt(hex.slice(i, i + 2), 16),
    );
    expect(Math.max(red, green)).toBeLessThan(8);
    expect(blue).toBeGreaterThan(247);
    // Leaving the picker, undo takes back the pick and the mask.
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    expect(await layers()).toHaveLength(1);
  });

  await test.step("a brush dab on the dot paints it, and stays on it as the correction changes", async () => {
    const at = await dotOnPage(page);
    await page.keyboard.press("b");
    const options = page.getByRole("group", { name: "Layer options" });
    await options.getByRole("button", { name: "Color", exact: true }).click();
    const size = options.getByRole("textbox", { name: "Size", exact: true });
    await size.fill("8");
    await size.press("Enter");
    await page.mouse.click(at[0], at[1]);
    await expect.poll(async () => (await layers()).at(-1)?.kind).toBe("paint");
    const paint = (await layers()).at(-1);
    if (paint?.kind !== "paint") throw Error("Missing paint layer.");
    expect(paint.strokes).toHaveLength(1);
    expect(distance(paint.strokes[0].points[0], dot)).toBeLessThan(2);
    const painted = await paintOnDot(page);
    expect(distance(painted.paint, painted.dot)).toBeLessThan(1.5);
    await correct(page, "Vertical", "-20");
    expect((await state()).frame?.perspective).toEqual([0, -20]);
    const kept = await paintOnDot(page);
    expect(distance(kept.paint, kept.dot)).toBeLessThan(1.5);
  });

  await test.step("a Remove patch starts on the dot, its contour's anchor under the click", async () => {
    const at = await dotOnPage(page);
    await page.keyboard.press("h");
    const canvas = page.getByLabel("Healing canvas", { exact: true });
    await expect(canvas).toBeVisible();
    const size = page.getByRole("textbox", { name: "Size", exact: true });
    await size.fill("30");
    await size.press("Enter");
    await page.mouse.click(at[0], at[1]);
    const patches = async () => {
      const heal = (await layers()).find((layer) => layer.kind === "heal");
      return heal?.kind === "heal" ? heal.patches : [];
    };
    await expect.poll(async () => (await patches()).length).toBe(1);
    const [patch] = await patches();
    expect(distance(patch.strokes[0].points[0], dot)).toBeLessThan(2);
    const handle = canvas.locator('[data-heal-destination-handle="true"]');
    const origin = await box(canvas);
    const [cx, cy] = await Promise.all(
      ["cx", "cy"].map(async (name) => Number(await handle.getAttribute(name))),
    );
    expect(distance([origin.x + cx, origin.y + cy], at)).toBeLessThan(1);
  });
});

test("gradient guides reaching past the correction's horizon keep the parts the photo shows", async ({
  page,
}) => {
  await openPhoto(page);
  // The strongest Horizontal puts the horizon 1933 source pixels from the photo's left edge.
  await correct(page, "Horizontal", "100");
  const guide = (label: string) => page.getByLabel(label, { exact: true });
  const mask = await page.evaluate(() => {
    const api = window.openlight;
    const id = api.addLayer("mask");
    api.setLayerMask(id, {
      kind: "radial",
      center: [1000, 400],
      radius: [1000, 200],
      angle: 0,
      feather: 0.5,
    });
    return id;
  });
  await page.keyboard.press("r");
  // The right edge lies past the horizon; the contour, the other handles, and rotation remain.
  await expect(guide("Move radial gradient")).toHaveCount(1);
  for (const label of [
    "Move gradient",
    "Radial left radius",
    "Radial top radius",
    "Radial bottom radius",
    "Rotate radial gradient",
  ]) {
    await expect(guide(label)).toHaveCount(1);
  }
  await expect(guide("Radial right radius")).toHaveCount(0);

  await page.evaluate(
    (id) =>
      window.openlight.setLayerMask(id, {
        kind: "linear",
        start: [600, 400],
        end: [2400, 400],
      }),
    mask,
  );
  // The end lies past the horizon; the start and middle guides remain.
  for (const label of [
    "Gradient start guide",
    "Gradient rotate guide",
    "Move gradient",
  ]) {
    await expect(guide(label)).toHaveCount(1);
  }
  await expect(guide("Gradient end guide")).toHaveCount(0);
});
