import { expect, expectNear, test } from "./fixtures";
import { readImage } from "./images";

test("vignette darkens a white image's edges, softens, undoes and disables", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "white.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="white"/></svg>',
    ),
  });
  await page.getByRole("button", { name: "Add effect", exact: true }).click();
  await page.getByRole("menuitem", { name: "Vignette", exact: true }).click();
  const intensity = page.getByRole("textbox", {
    name: "Intensity",
    exact: true,
  });
  await intensity.fill("80");
  await intensity.press("Enter");
  const vignetted = await readImage(page);
  // The center stays white.
  expect(Math.min(...vignetted.center)).toBeGreaterThanOrEqual(253);
  expect(vignetted.corner[0]).toBeLessThan(255);

  const softness = page.getByRole("textbox", { name: "Softness", exact: true });
  await softness.fill("100");
  await softness.press("Enter");
  expect((await readImage(page)).corner[0]).toBeLessThan(vignetted.corner[0]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await readImage(page);
  expectNear(undone.center, vignetted.center, 1);
  expectNear(undone.corner, vignetted.corner, 1);

  await intensity.fill("0");
  await intensity.press("Enter");
  expectNear((await readImage(page)).corner, [255, 255, 255, 255], 1);
});
