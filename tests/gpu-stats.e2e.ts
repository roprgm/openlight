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
  await stats.getByRole("button", { name: "Reset" }).click();
  for (const next of ["2", "0.5", "1.5"]) {
    await exposure.fill(next);
    await exposure.press("Enter");
  }
  await page.waitForTimeout(1500);
  await expect(value("Buffers")).toHaveText(/ · 0 made · 0 freed/);
  await expect(value("Textures")).toHaveText(/ · 0 made · 0 freed/);
});
