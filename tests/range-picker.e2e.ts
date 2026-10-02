import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { box } from "./pointer";

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

async function open(page: Page) {
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
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "orange.svg",
    mimeType: "image/svg+xml",
    buffer: photo,
  });
  await expect(page.getByRole("textbox", { name: "Exposure" })).toHaveValue(
    "0.00",
  );
}

async function pick(page: Page) {
  const picker = page.getByRole("application", { name: "Color range canvas" });
  const canvas = await box(picker);
  await page.mouse.click(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
}

test("a delayed pick stays with its original selection", async ({ page }) => {
  await open(page);
  const { first, second } = await page.evaluate(() => {
    const api = window.openlight;
    const first = api.addLayer("mask");
    api.setLayerMask(first, {
      kind: "color-range",
      color: "#000000",
      tolerance: 20,
    });
    const second = api.addLayer("mask");
    api.setLayerMask(second, {
      kind: "color-range",
      color: "#ffffff",
      tolerance: 20,
    });
    api.selectLayer(first);
    return { first, second };
  });
  await page
    .getByRole("button", { name: "Pick a color from the photo" })
    .click();
  await page.evaluate(() => window.rangeSampleGate.pauseNext());
  await pick(page);
  await page.waitForFunction(() => window.rangeSampleGate.waiting);
  await page.evaluate((id) => window.openlight.selectLayer(id), second);
  await page.evaluate(() => window.rangeSampleGate.release());
  await page.waitForFunction(() => window.rangeSampleGate.settled > 0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { history } = window.openlight.getState();
        return "editing" in history && history.editing;
      }),
    )
    .toBe(false);
  const colors = await page.evaluate(
    ([a, b]) =>
      [a, b].map((id) => {
        const layer = window.openlight
          .getState()
          .scene?.layers.find((item) => item.id === id);
        return layer?.kind === "mask" && layer.mask.kind === "color-range"
          ? layer.mask.color
          : undefined;
      }),
    [first, second],
  );
  expect(colors).toEqual(["#000000", "#ffffff"]);
});

test("leaving the picker cancels a delayed pick", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add effect" }).click();
  await page.getByRole("menuitem", { name: "Color Range" }).click();
  await page.evaluate(() => window.rangeSampleGate.pauseNext());
  await pick(page);
  await page.waitForFunction(() => window.rangeSampleGate.waiting);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("application", { name: "Color range canvas" }),
  ).toHaveCount(0);
  await page.evaluate(() => window.rangeSampleGate.release());
  await page.waitForFunction(() => window.rangeSampleGate.settled > 0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { history } = window.openlight.getState();
        return "editing" in history && history.editing;
      }),
    )
    .toBe(false);
  const masks = await page.evaluate(
    () =>
      window.openlight
        .getState()
        .scene?.layers.filter((item) => item.kind === "mask").length,
  );
  expect(masks).toBe(0);
});

test("an old pending pick cannot cancel a new gesture's history", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const api = window.openlight;
    const id = api.addLayer("mask");
    api.setLayerMask(id, {
      kind: "color-range",
      color: "#000000",
      tolerance: 20,
    });
  });
  const button = page.getByRole("button", {
    name: "Pick a color from the photo",
  });
  await button.click();
  const picker = page.getByRole("application", { name: "Color range canvas" });
  const canvas = await box(picker);
  const x = canvas.x + canvas.width / 2;
  const y = canvas.y + canvas.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(page.getByLabel("Range color")).toHaveValue("#e07020");
  await page.evaluate(() => window.rangeSampleGate.pauseNext());
  await page.mouse.move(x + 5, y);
  await page.waitForFunction(() => window.rangeSampleGate.waiting);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await button.click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForFunction(() => {
    const { history } = window.openlight.getState();
    return "editing" in history && history.editing;
  });
  await page.evaluate(() => window.rangeSampleGate.release());
  await page.waitForFunction(() => window.rangeSampleGate.settled > 0);
  const editing = await page.evaluate(() => {
    const { history } = window.openlight.getState();
    return "editing" in history && history.editing;
  });
  expect(editing).toBe(true);
  await page.mouse.up();
});

test("a failed read reports the error and the next pick succeeds", async ({
  page,
}) => {
  await open(page);
  const id = await page.evaluate(() => {
    const api = window.openlight;
    const id = api.addLayer("mask");
    api.setLayerMask(id, {
      kind: "color-range",
      color: "#000000",
      tolerance: 20,
    });
    return id;
  });
  await page
    .getByRole("button", { name: "Pick a color from the photo" })
    .click();
  await page.evaluate(() => window.rangeSampleGate.pauseNext());
  await pick(page);
  await page.waitForFunction(() => window.rangeSampleGate.waiting);
  await page.evaluate(() => window.rangeSampleGate.reject());
  await expect(
    page.getByText("Couldn't pick a color. Try again."),
  ).toBeVisible();
  await pick(page);
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const layer = window.openlight
          .getState()
          .scene?.layers.find((item) => item.id === id);
        return layer?.kind === "mask" && layer.mask.kind === "color-range"
          ? layer.mask.color
          : undefined;
      }, id),
    )
    .toBe("#e07020");
});
