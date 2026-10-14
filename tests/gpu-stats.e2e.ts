import { expect, test } from "./fixtures";

test("?stats counts the GPU's textures and buffers, and Reset starts a workflow from zero", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?stats");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  const exposure = page.getByRole("textbox", { name: "Exposure", exact: true });
  await expect(exposure).toHaveValue("0.00");
  const stats = page.getByRole("region", { name: "GPU stats" });
  const value = (label: string) =>
    stats.locator("dt", { hasText: label }).locator("+ dd");
  await expect(value("Textures")).toHaveText(/^[1-9]\d* live · [1-9]\d* made/);
  await expect(value("GPU")).toHaveText(/^\d+\.\d MB · peak/);
  await stats.getByRole("button", { name: "Reset" }).click();
  await expect(value("Textures")).toHaveText(/ · 0 made · 0 freed/);
  // A tone curve adds a pass, which renders into a texture of its own.
  await page.evaluate(() =>
    window.openlight.setToneCurve([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 1, y: 1 },
    ]),
  );
  await expect(value("Textures")).toHaveText(/ · [1-9]\d* made/);
  // Changing values only rewrites uniforms: every render, histograms included, reuses what it has.
  // Counted here, since the panel refreshes once a second with no sign of which renders it saw.
  const counts = await page.evaluateHandle(() => {
    const counts = { made: 0, destroyed: 0 };
    const { createTexture, createBuffer } = GPUDevice.prototype;
    const destroyTexture = GPUTexture.prototype.destroy;
    const destroyBuffer = GPUBuffer.prototype.destroy;
    GPUDevice.prototype.createTexture = function (descriptor) {
      counts.made++;
      return createTexture.call(this, descriptor);
    };
    GPUDevice.prototype.createBuffer = function (descriptor) {
      counts.made++;
      return createBuffer.call(this, descriptor);
    };
    GPUTexture.prototype.destroy = function () {
      counts.destroyed++;
      destroyTexture.call(this);
    };
    GPUBuffer.prototype.destroy = function () {
      counts.destroyed++;
      destroyBuffer.call(this);
    };
    return counts;
  });
  const histogram = page
    .getByLabel("output histogram", { exact: true })
    .locator("polyline")
    .first();
  for (const next of ["2", "0.5", "1.5"]) {
    const shown = (await histogram.getAttribute("points")) ?? "";
    await exposure.fill(next);
    await exposure.press("Enter");
    // The histogram reads back the finished render.
    await expect(histogram).not.toHaveAttribute("points", shown);
  }
  expect(await counts.jsonValue()).toEqual({ made: 0, destroyed: 0 });
});
