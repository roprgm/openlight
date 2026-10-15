import type { Page } from "@playwright/test";
import { expect, expectNear, openImage, test } from "./fixtures";
import { readImage } from "./images";
import { box } from "./pointer";

// An init script holds the picker's GPU readbacks until a test releases them.
test.use({ isolated: true });

declare global {
  interface Window {
    rangeSampleGate: {
      waiting: boolean;
      settled: number;
      pauseNext: () => void;
      release: () => void;
      reject: () => void;
    };
  }
}

const photo = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#e07020"/></svg>',
);

async function open(page: Page, buffer = photo) {
  await page.addInitScript(() => {
    const mapAsync = GPUBuffer.prototype.mapAsync;
    let paused = false;
    let settled = 0;
    let release: (() => void) | undefined;
    let reject: (() => void) | undefined;
    window.rangeSampleGate = {
      get waiting() {
        return Boolean(release);
      },
      get settled() {
        return settled;
      },
      pauseNext() {
        paused = true;
      },
      release() {
        release?.();
      },
      reject() {
        reject?.();
      },
    };
    GPUBuffer.prototype.mapAsync = function (mode, offset, size) {
      if (!paused || this.size !== 16) {
        return mapAsync.call(this, mode, offset, size);
      }
      paused = false;
      return new Promise<void>((resolve, fail) => {
        release = () => {
          release = undefined;
          reject = undefined;
          mapAsync.call(this, mode, offset, size).then(() => {
            settled++;
            resolve();
          }, fail);
        };
        reject = () => {
          release = undefined;
          reject = undefined;
          fail(new Error("Injected sample failure"));
        };
      });
    };
  });
  await openImage(page, {
    name: "orange.svg",
    mimeType: "image/svg+xml",
    buffer,
  });
  await expect(page.getByRole("textbox", { name: "Exposure" })).toHaveValue(
    "0.00",
  );
}

/** Clicks the picker canvas `dx` pixels right of its center. */
async function pick(page: Page, dx = 0) {
  const picker = page.getByRole("application", { name: "Color range canvas" });
  const canvas = await box(picker);
  await page.mouse.click(
    canvas.x + canvas.width / 2 + dx,
    canvas.y + canvas.height / 2,
  );
}

/** Holds the next pick's read until `releasePick`. */
async function pausePick(page: Page) {
  await page.evaluate(() => window.rangeSampleGate.pauseNext());
}

async function releasePick(page: Page) {
  const settled = await page.evaluate(() => window.rangeSampleGate.settled);
  await page.evaluate(() => window.rangeSampleGate.release());
  await page.waitForFunction(
    (settled) => window.rangeSampleGate.settled > settled,
    settled,
  );
}

function editing(page: Page) {
  return page.evaluate(() => {
    const { history } = window.openlight.getState();
    return "editing" in history && history.editing;
  });
}

function rangeColors(page: Page, ids: string[]) {
  return page.evaluate(
    (ids) =>
      ids.map((id) => {
        const layer = window.openlight
          .getState()
          .scene?.layers.find((item) => item.id === id);
        return layer?.kind === "mask" && layer.mask.kind === "color-range"
          ? layer.mask.color
          : undefined;
      }),
    ids,
  );
}

function addColorRange(page: Page, color: string) {
  return page.evaluate((color) => {
    const api = window.openlight;
    const id = api.addLayer("mask");
    api.setLayerMask(id, { kind: "color-range", color, tolerance: 20 });
    return id;
  }, color);
}

test.describe("mixed pointers", () => {
  test.use({ hasTouch: true });

  test("a touch cannot replace an active mouse pick, and adding or selecting a color range retargets the picker", async ({
    page,
  }) => {
    await open(
      page,
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100" height="200" fill="#e07020"/><rect x="100" width="100" height="200" fill="#2060d0"/></svg>',
      ),
    );
    const picker = page.getByRole("application", {
      name: "Color range canvas",
    });
    const add = async () => {
      await page.getByRole("button", { name: "Add effect" }).click();
      await page.getByRole("menuitem", { name: "Color Range" }).click();
      return page.evaluate(
        () => window.openlight.getState().selectedLayerId ?? "",
      );
    };

    const first = await add();

    await test.step("a touch cannot replace an active mouse pick", async () => {
      const canvas = await box(picker);
      const x = canvas.x + canvas.width / 2 - 20;
      const y = canvas.y + canvas.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await expect(page.getByLabel("Range color")).toHaveValue("#e07020");
      await page.touchscreen.tap(x, y);
      await page.mouse.move(x + 40, y);
      await expect(page.getByLabel("Range color")).toHaveValue("#2060d0");
      await page.mouse.up();
      await expect.poll(() => editing(page)).toBe(false);
      // Undo takes back the pick and keeps the range.
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByLabel("Range color")).toHaveCount(0);
    });

    await test.step("adding another color range and selecting an existing one retargets the picker", async () => {
      const second = await add();
      expect(second).not.toBe(first);
      await expect(picker).toBeVisible();
      await pick(page, -20);
      await expect.poll(() => rangeColors(page, [second])).toEqual(["#e07020"]);
      await page
        .getByRole("button", { name: "Select Color Range", exact: true })
        .last()
        .click();
      await expect(picker).toBeVisible();
      await pick(page, -20);
      await expect
        .poll(() => rangeColors(page, [first, second]))
        .toEqual(["#e07020", "#e07020"]);
    });
  });
});

test("delayed and failed picks stay with their range, and leaving the picker drops them", async ({
  page,
}) => {
  await open(page);
  const picker = page.getByRole("application", { name: "Color range canvas" });
  const pickButton = page.getByRole("button", {
    name: "Pick a color from the photo",
  });

  await test.step("selection away or deletion leaves the picker, and K needs a color range", async () => {
    await page.keyboard.press("k");
    await expect(picker).toHaveCount(0);
    await page.getByRole("button", { name: "Add effect" }).click();
    await page.getByRole("menuitem", { name: "Color Range" }).click();
    const id = await page.evaluate(
      () => window.openlight.getState().selectedLayerId ?? "",
    );
    expect(id).not.toBe("");
    await expect(picker).toBeVisible();
    await page.evaluate(() => {
      const api = window.openlight;
      api.selectLayer(api.getState().scene?.layers[0].id ?? "");
    });
    await expect(picker).toHaveCount(0);
    await page
      .getByRole("button", { name: "Select Color Range", exact: true })
      .last()
      .click();
    await expect(picker).toBeVisible();
    await pausePick(page);
    await pick(page);
    await page.waitForFunction(() => window.rangeSampleGate.waiting);
    await page.evaluate((layerId) => window.openlight.deleteLayer(layerId), id);
    await expect(picker).toHaveCount(0);
    await releasePick(page);
    expect(
      await page.evaluate(
        (layerId) =>
          window.openlight
            .getState()
            .scene?.layers.some((layer) => layer.id === layerId),
        id,
      ),
    ).toBe(false);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(picker).toHaveCount(0);
    await page
      .getByRole("button", { name: "Select Color Range", exact: true })
      .click();
    await expect(picker).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(picker).toHaveCount(0);
  });

  await test.step("leaving the picker cancels a delayed pick but keeps its new mask", async () => {
    await page.getByRole("button", { name: "Add effect" }).click();
    await page.getByRole("menuitem", { name: "Color Range" }).click();
    const initial = await page.evaluate(() => window.openlight.getState());
    expect(initial.scene?.layers.at(-1)).toMatchObject({
      kind: "mask",
      mask: { kind: "color-range", color: null },
    });
    expect(initial.selectedLayerId).toBe(initial.scene?.layers.at(-1)?.id);
    await pausePick(page);
    await pick(page);
    await page.waitForFunction(() => window.rangeSampleGate.waiting);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await releasePick(page);
    await expect.poll(() => editing(page)).toBe(false);
    expect(
      await page.evaluate(() =>
        window.openlight.getState().scene?.layers.at(-1),
      ),
    ).toMatchObject({
      kind: "mask",
      mask: { kind: "color-range", color: null },
    });
  });

  await test.step("a delayed pick stays with its original selection", async () => {
    const first = await addColorRange(page, "#000000");
    const second = await addColorRange(page, "#ffffff");
    await page.evaluate((id) => window.openlight.selectLayer(id), first);
    await pickButton.click();
    await pausePick(page);
    await pick(page);
    await page.waitForFunction(() => window.rangeSampleGate.waiting);
    await page.evaluate((id) => window.openlight.selectLayer(id), second);
    await expect(picker).toBeVisible();
    await releasePick(page);
    await expect.poll(() => editing(page)).toBe(false);
    expect(await rangeColors(page, [first, second])).toEqual([
      "#000000",
      "#ffffff",
    ]);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
  });

  await test.step("an old pending pick cannot cancel a new gesture's history", async () => {
    await addColorRange(page, "#000000");
    await pickButton.click();
    const canvas = await box(picker);
    const x = canvas.x + canvas.width / 2;
    const y = canvas.y + canvas.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(page.getByLabel("Range color")).toHaveValue("#e07020");
    await pausePick(page);
    await page.mouse.move(x + 5, y);
    await page.waitForFunction(() => window.rangeSampleGate.waiting);
    await page.mouse.up();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await pickButton.click();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect.poll(() => editing(page)).toBe(true);
    await releasePick(page);
    expect(await editing(page)).toBe(true);
    await page.mouse.up();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
  });

  await test.step("a failed read reports the error and the next pick succeeds", async () => {
    const id = await addColorRange(page, "#000000");
    await pickButton.click();
    await pausePick(page);
    await pick(page);
    await page.waitForFunction(() => window.rangeSampleGate.waiting);
    await page.evaluate(() => window.rangeSampleGate.reject());
    await expect(
      page.getByText("Couldn't pick a color. Try again."),
    ).toBeVisible();
    await pick(page);
    await expect.poll(() => rangeColors(page, [id])).toEqual(["#e07020"]);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
  });

  await test.step("a range inside a hidden effect can still pick its source color", async () => {
    const original = (await readImage(page)).center;
    const parent = await page.evaluate(() => {
      const api = window.openlight;
      const parent = api.addLayer("exposure");
      api.setExposure(parent, -1);
      const child = api.addLayer("mask", { inside: parent });
      api.setLayerMask(child, {
        kind: "color-range",
        color: null,
        tolerance: 30,
      });
      return parent;
    });
    const exposed = (await readImage(page)).center;
    await page.evaluate(
      (id) => window.openlight.setLayer(id, { visible: false }),
      parent,
    );
    const before = await page.evaluate(
      () => window.openlight.getState().history.undoCount,
    );
    await pickButton.click();
    await pick(page);
    const color = page.getByLabel("Range color");
    await expect(color).toHaveValue(/^#[0-9a-f]{6}$/);
    const hex = await color.inputValue();
    expectNear(
      [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)),
      exposed.slice(0, 3),
      1,
    );
    expectNear((await readImage(page)).center, original, 1);
    expect(
      await page.evaluate(() => window.openlight.getState().history.undoCount),
    ).toBe(before + 1);
  });
});
