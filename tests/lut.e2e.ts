import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("a LUT layer grades the photo from a .cube file at the layer's opacity, undoes, and saves with the scene", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  const exposure = page.getByRole("textbox", { name: "Exposure", exact: true });
  await expect(exposure).toHaveValue("0.00");
  // The blue patch, #305080, and the gray middle.
  const points = [
    [350, 200],
    [600, 400],
  ] as const;
  const sample = async () => (await readImage(page, undefined, points)).samples;
  const near = (actual: number[] | undefined, expected: number[]) => {
    for (const [channel, value] of expected.entries()) {
      expect(Math.abs((actual?.[channel] ?? 0) - value)).toBeLessThanOrEqual(1);
    }
  };
  const original = await sample();
  expect(original).toEqual([
    [48, 80, 128, 255],
    [128, 128, 128, 255],
  ]);
  const layers = page.getByRole("region", { name: "Layers", exact: true });

  await test.step("the Add menu asks for a .cube file and grades the photo with it", async () => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add effect", exact: true }).click();
    await page.getByRole("menuitem", { name: "LUT", exact: true }).click();
    await (await chooser).setFiles("tests/fixtures/swap.cube");
    await expect(layers.getByText("Swap red and blue")).toBeVisible();
    const [patch, gray] = (await sample()) ?? [];
    near(patch, [128, 80, 48, 255]);
    near(gray, [128, 128, 128, 255]);
  });
  const swapped = await sample();

  await test.step("the layer's opacity sets its strength", async () => {
    const opacity = page.getByRole("textbox", { name: "Opacity", exact: true });
    await opacity.fill("50");
    await opacity.press("Enter");
    const [patch] = (await sample()) ?? [];
    expect(patch?.[0]).toBeGreaterThan(48);
    expect(patch?.[0]).toBeLessThan(128);
    expect(patch?.[2]).toBeGreaterThan(48);
    expect(patch?.[2]).toBeLessThan(128);
  });
  const half = await sample();

  await test.step("undo steps back through the opacity and the layer", async () => {
    await page.keyboard.press("ControlOrMeta+z");
    expect(await sample()).toEqual(swapped);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await sample()).toEqual(original);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect(await sample()).toEqual(half);
  });

  await test.step("a scene file carries the LUT", async () => {
    const reopened = await page.evaluate(async () => {
      const api = window.openlight;
      const before = api.getState().documentId;
      await api.loadScene(await api.exportScene());
      return before !== api.getState().documentId;
    });
    expect(reopened).toBe(true);
    await expect(layers.getByText("Swap red and blue")).toBeVisible();
    expect(await sample()).toEqual(half);
  });

  await test.step("a file that isn't a 3D LUT says why and changes nothing", async () => {
    const before = await page.evaluate(() => window.openlight.getState());
    await page.evaluate(() =>
      window.openlight.openFile(
        new File(["LUT_1D_SIZE 2\n0 0 0\n1 1 1\n"], "curve.cube"),
      ),
    );
    await expect(
      page.getByText("Couldn't open curve.cube: Error: This is a 1D LUT"),
    ).toBeVisible();
    const after = await page.evaluate(() => window.openlight.getState());
    expect(after.failure?.file).toBe("curve.cube");
    expect(after.scene).toEqual(before.scene);
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  });
});
