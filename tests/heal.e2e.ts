import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box } from "./pointer";

test("healing preserves an edge, alpha, and HDR texture at full and proxy resolution", async ({
  page,
}) => {
  await page.goto("/tests/gpu.html");
  const result = await page.evaluate(async () => {
    const path = "/tests/heal-gpu.ts";
    const { renderHealReference } = (await import(
      path
    )) as typeof import("./heal-gpu");
    return renderHealReference();
  });
  expect(result.errors).toEqual([]);
  for (const { feather, samples } of result.results) {
    for (const [index, { actual, expected }] of samples.entries()) {
      if (feather > 0 && index < 4) continue;
      for (let channel = 0; channel < 4; channel++) {
        expect(Math.abs(actual[channel] - expected[channel])).toBeLessThan(
          0.015,
        );
      }
    }
  }
  const interactive = result.results.filter(({ proxy }) => proxy);
  expect(interactive).toHaveLength(2);
  for (let channel = 0; channel < 4; channel++) {
    expect(
      Math.abs(
        interactive[0].samples[0].actual[channel] -
          interactive[1].samples[0].actual[channel],
      ),
    ).toBeLessThan(0.002);
  }
});

test("Healing paints patches, edits them, and undoes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  const before = await readImage(page, undefined, [
    [350, 200],
    [600, 400],
  ]);
  await page.keyboard.press("h");
  const canvas = page.getByLabel("Healing canvas", { exact: true });
  await expect(canvas).toBeVisible();
  expect(await box(canvas)).toEqual(
    await box(page.getByRole("region", { name: "Image canvas" })),
  );
  await expect(page.getByText("Paint to repair", { exact: false })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Healing", exact: true }),
  ).toBeVisible();
  const toolbar = page.getByRole("group", { name: "Layer options" });
  const initialToolbarWidth = await toolbar.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const size = page.getByRole("textbox", { name: "Size", exact: true });
  const brushCursor = canvas.locator('[data-brush-cursor="true"]');
  await size.focus();
  await expect(brushCursor).toHaveAttribute("data-preview", "true");
  await size.fill("300");
  await size.press("Enter");
  await expect(brushCursor).toHaveCount(0);
  const feather = page.getByRole("textbox", { name: "Feather", exact: true });
  await expect(feather).toHaveValue("10");
  await feather.focus();
  await expect(brushCursor).toHaveAttribute("data-preview", "true");
  await feather.fill("0");
  await feather.press("Enter");
  await expect(brushCursor).toHaveCount(0);
  expect(
    await toolbar.evaluate((element) => element.getBoundingClientRect().width),
  ).toBe(initialToolbarWidth);
  const bounds = await box(canvas);
  const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
  await page.mouse.click(
    bounds.x + bounds.width / 2 - 250 * scale,
    bounds.y + bounds.height / 2 - 200 * scale,
  );
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const { history } = window.openlight.getState();
        return "editing" in history && history.editing;
      }),
    )
    .toBe(false);
  const state = await page.evaluate(() => window.openlight.getState());
  const layer = state.scene?.layers.find((layer) => layer.kind === "heal");
  expect(layer?.kind).toBe("heal");
  if (layer?.kind !== "heal") {
    throw Error("Heal layer missing");
  }
  expect(layer.patches).toHaveLength(1);
  // A click in the canvas margin, where the brush cannot reach the image, creates nothing.
  await page.mouse.click(bounds.x + 4, bounds.y + 4);
  expect(
    await page.evaluate(() => {
      const { scene, history } = window.openlight.getState();
      const healing = scene?.layers.find((layer) => layer.kind === "heal");
      return {
        patches: healing?.kind === "heal" ? healing.patches.length : 0,
        editing: "editing" in history && history.editing,
      };
    }),
  ).toEqual({ patches: 1, editing: false });
  await expect(page.getByText("Patch 1", { exact: true })).toBeVisible();
  const patchList = page.getByRole("list", { name: "Healing patches" });
  await expect(
    patchList.getByRole("button", { name: "Select patch 1" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(canvas.locator('[data-heal-outline="destination"]')).toHaveCount(
    1,
  );
  await expect(canvas.locator('[data-heal-outline="source"]')).toHaveCount(1);
  await expect(canvas.locator('[data-heal-source-handle="true"]')).toHaveCount(
    1,
  );
  await expect(
    canvas.locator('[data-heal-destination-handle="true"]'),
  ).toHaveCount(1);
  await expect(canvas.locator("[data-heal-connector]")).toHaveCount(0);
  await expect(
    canvas.getByRole("button", { name: "Select patch 1" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Opacity", exact: true }),
  ).toHaveValue("100");
  await expect(
    page.getByRole("textbox", { name: "Opacity", exact: true }),
  ).toHaveCount(1);
  await size.fill("120");
  await size.press("Enter");
  expect(
    await page.evaluate(() => {
      const healing = window.openlight
        .getState()
        .scene?.layers.find((item) => item.kind === "heal");
      return healing?.kind === "heal" ? healing.patches[0].stroke.size : 0;
    }),
  ).toBe(300);
  await size.fill("300");
  await size.press("Enter");
  expect(layer.patches[0].offset).not.toEqual([0, 0]);
  const after = await readImage(page, undefined, [
    [350, 200],
    [600, 400],
    [510, 200],
  ]);
  for (const channel of after.samples?.[0].slice(0, 3) ?? []) {
    expect(Math.abs(channel - 128)).toBeLessThanOrEqual(5);
  }
  expect(after.samples?.[1]).toEqual(before.samples?.[1]);
  expect(after.samples?.[2]).toEqual([128, 128, 128, 255]);
  await page.evaluate(
    ({ id, patch }) => window.openlight.setHealSource(id, patch, [0, 360]),
    { id: layer.id, patch: layer.patches[0].id },
  );
  expect(
    (await readImage(page, undefined, [[350, 200]])).samples?.[0][0],
  ).toBeGreaterThan(120);
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  expect((await readImage(page, undefined, [[350, 200]])).samples?.[0]).toEqual(
    before.samples?.[0],
  );
  // Alt-click explicitly chooses the next donor using the same document mapping.
  await page.keyboard.down("Alt");
  await page.mouse.click(
    bounds.x + bounds.width / 2 - 250 * scale,
    bounds.y + bounds.height / 2 + 160 * scale,
  );
  await page.keyboard.up("Alt");
  const automatic = toolbar.getByRole("button", { name: "Automatic source" });
  await expect(automatic).toBeVisible();
  const targetX = bounds.x + bounds.width / 2 - 250 * scale;
  const targetY = bounds.y + bounds.height / 2 - 200 * scale;
  await page.mouse.move(targetX, targetY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY + 60);
  const drawingAnchor = canvas.locator('[data-heal-destination-anchor="true"]');
  await expect(drawingAnchor).toHaveCount(1);
  const drawingAnchorBounds = await drawingAnchor.boundingBox();
  if (!drawingAnchorBounds) throw Error("Healing anchor is unavailable");
  expect(
    Math.abs(drawingAnchorBounds.x + drawingAnchorBounds.width / 2 - targetX),
  ).toBeLessThan(2);
  expect(
    Math.abs(drawingAnchorBounds.y + drawingAnchorBounds.height / 2 - targetY),
  ).toBeLessThan(2);
  await page.mouse.up();
  const manual = await page.evaluate(() => {
    const layer = window.openlight
      .getState()
      .scene?.layers.find((layer) => layer.kind === "heal");
    if (layer?.kind !== "heal") throw Error("Healing layer missing");
    const patch = layer.patches.at(-1);
    if (!patch) throw Error("Healing patch missing");
    return { id: patch.id };
  });
  expect((await readImage(page, undefined, [[350, 200]])).samples?.[0]).toEqual(
    [128, 128, 128, 255],
  );
  // Automatic source drops the manual donor, so the next patch searches for its own.
  await automatic.click();
  await expect(automatic).toHaveCount(0);
  await page.mouse.click(
    bounds.x + bounds.width / 2 + 250 * scale,
    bounds.y + bounds.height / 2 + 200 * scale,
  );
  await expect
    .poll(async () => {
      const state = await page.evaluate(() => window.openlight.getState());
      const healing = state.scene?.layers.find((item) => item.kind === "heal");
      const editing = "editing" in state.history && state.history.editing;
      return healing?.kind === "heal" && !editing ? healing.patches.length : 0;
    })
    .toBe(2);
  const donors = await page.evaluate(() => {
    const healing = window.openlight
      .getState()
      .scene?.layers.find((item) => item.kind === "heal");
    return healing?.kind === "heal"
      ? healing.patches.map(({ stroke, offset }) => [
          Math.round(stroke.points[0][0] + offset[0]),
          Math.round(stroke.points[0][1] + offset[1]),
        ])
      : [];
  });
  expect(donors[1]).not.toEqual(donors[0]);
  const firstPatch = patchList.getByRole("button", { name: "Select patch 1" });
  await firstPatch.hover();
  await expect(canvas.locator(`[data-heal-patch="${manual.id}"]`)).toHaveCount(
    1,
  );
  await page.mouse.click(
    bounds.x + bounds.width / 2 - 250 * scale,
    bounds.y + bounds.height / 2 - 200 * scale,
  );
  await expect(firstPatch).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() => {
      const healing = window.openlight
        .getState()
        .scene?.layers.find((item) => item.kind === "heal");
      return healing?.kind === "heal" ? healing.patches.length : 0;
    }),
  ).toBe(2);
  const sourceX = () =>
    page.evaluate((patchId) => {
      const healing = window.openlight
        .getState()
        .scene?.layers.find((item) => item.kind === "heal");
      const patch =
        healing?.kind === "heal"
          ? healing.patches.find((item) => item.id === patchId)
          : undefined;
      if (!patch) throw Error("Healing patch missing");
      return Math.round(patch.stroke.points[0][0] + patch.offset[0]);
    }, manual.id);
  const beforeDrag = await sourceX();
  const handle = canvas.locator('[data-heal-source-handle="true"]');
  const handleBounds = await handle.boundingBox();
  if (!handleBounds) throw Error("Healing source handle is unavailable");
  await handle.hover();
  await expect(canvas.locator("svg:has(radialGradient)")).toHaveCount(0);
  await page.mouse.move(bounds.x + 10, bounds.y + 10);
  await expect(canvas.locator("svg:has(radialGradient)")).toHaveCount(1);
  await page.mouse.move(
    handleBounds.x + handleBounds.width / 2,
    handleBounds.y + handleBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBounds.x + handleBounds.width / 2 + 30,
    handleBounds.y + handleBounds.height / 2,
  );
  await page.mouse.up();
  await expect.poll(sourceX).not.toBe(beforeDrag);
  const fixedSource = await sourceX();
  const beforeDestination = await page.evaluate((patchId) => {
    const healing = window.openlight
      .getState()
      .scene?.layers.find((item) => item.kind === "heal");
    const patch =
      healing?.kind === "heal"
        ? healing.patches.find((item) => item.id === patchId)
        : undefined;
    return patch?.stroke.points[0][0];
  }, manual.id);
  const destination = canvas.locator('[data-heal-destination-handle="true"]');
  const destinationBounds = await destination.boundingBox();
  if (!destinationBounds) throw Error("Healing destination is unavailable");
  await page.mouse.move(
    destinationBounds.x + destinationBounds.width / 2,
    destinationBounds.y + destinationBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    destinationBounds.x + destinationBounds.width / 2 + 30,
    destinationBounds.y + destinationBounds.height / 2 + 20,
  );
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate((patchId) => {
        const healing = window.openlight
          .getState()
          .scene?.layers.find((item) => item.kind === "heal");
        const patch =
          healing?.kind === "heal"
            ? healing.patches.find((item) => item.id === patchId)
            : undefined;
        return patch?.stroke.points[0][0];
      }, manual.id),
    )
    .not.toBe(beforeDestination);
  expect(await sourceX()).toBe(fixedSource);
  await feather.fill("60");
  await feather.press("Enter");
  const opacity = page.getByRole("textbox", {
    name: "Opacity",
    exact: true,
  });
  await opacity.fill("50");
  await opacity.press("Enter");
  const thumbnail = patchList.getByLabel("Patch shape").first();
  const thumbnailBytes = await thumbnail.screenshot();
  const thumbnailMask = await page.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (!context) throw Error("Cannot inspect patch thumbnail.");
      context.drawImage(image, 0, 0);
      image.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const sample = (x: number, y: number) =>
        pixels.data[(y * canvas.width + x) * 4];
      return {
        center: sample(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
        ),
        edge: sample(Math.floor(canvas.width / 2), 2),
      };
    },
    [...thumbnailBytes],
  );
  // The thumbnail is the patch's own raster: hard coverage, with feather and opacity left to the blend.
  expect(thumbnailMask.edge).toBeLessThan(20);
  expect(thumbnailMask.center).toBeGreaterThan(200);
  await page.keyboard.press("Enter");
  await expect(canvas).not.toBeVisible();
  await page.getByRole("tab", { name: "Brush", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Feather", exact: true }),
  ).toHaveValue("50");
});

test("Healing takes the first stroke after H and finds donors inside a mask", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
  const canvas = page.getByRole("region", { name: "Image canvas" });
  const bounds = await box(canvas);
  const spot = [bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.4];
  async function healedPatches() {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { history } = window.openlight.getState();
          return "editing" in history && history.editing;
        }),
      )
      .toBe(false);
    return page.evaluate(() => {
      const selected = window.openlight.getState().selectedLayerId;
      const layers = window.openlight.getState().scene?.layers ?? [];
      const layer = layers
        .flatMap((layer) => [layer, ...layer.children])
        .find((layer) => layer.id === selected);
      return layer?.kind === "heal" ? layer.patches : [];
    });
  }

  await page.keyboard.press("h");
  await page.mouse.click(spot[0], spot[1]);
  expect(await healedPatches()).toHaveLength(1);

  await page.keyboard.press("Enter");
  const nested = await page.evaluate(() => {
    const api = window.openlight;
    const mask = api.addLayer("mask");
    api.setLayerMask(mask, {
      kind: "radial",
      center: [600, 400],
      radius: [2000, 2000],
      angle: 0,
      feather: 0,
    });
    const heal = api.addLayer("heal", { inside: mask });
    api.selectLayer(heal);
    return heal;
  });
  await page.keyboard.press("h");
  await page.mouse.click(spot[0], spot[1]);
  const patches = await healedPatches();
  expect(
    await page.evaluate(() => window.openlight.getState().selectedLayerId),
  ).toBe(nested);
  expect(patches).toHaveLength(1);
  expect(patches[0].offset).not.toEqual([0, 0]);
});
