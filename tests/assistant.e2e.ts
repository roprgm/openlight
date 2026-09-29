import { expect, openPhoto, test } from "./fixtures";

test("the assistant at /?assistant edits the photo it was asked about and selects the layer it edits", async ({
  page,
}) => {
  const requests: unknown[] = [];
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/assistant", async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      await route.fulfill({
        json: {
          commands: [
            { type: "set-adjustments", exposure: -1 },
            { type: "set-vignette", intensity: 40 },
          ],
          message: "exposure 0 → -1, vignette 0 → 40",
        },
      });
      return;
    }
    await released;
    await route.fulfill({
      json: {
        commands: [{ type: "set-adjustments", exposure: 2 }],
        message: "exposure 0 → 2",
      },
    });
  });
  const button = page.getByRole("button", { name: "Assistant", exact: true });
  const state = () => page.evaluate(() => window.openlight.getState());
  await openPhoto(page);
  await expect(button).toBeHidden();

  await page.goto("/?assistant");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await button.click();
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  await message.fill("darker, with a vignette");
  await message.press("Enter");
  await expect(
    page.getByText("exposure 0 → -1, vignette 0 → 40"),
  ).toBeVisible();
  expect(requests[0]).toMatchObject({
    message: "darker, with a vignette",
    photo: { sourceSize: [1200, 800] },
  });
  const edited = await state();
  expect(edited.adjustments.exposure).toBe(-1);
  const vignette = edited.scene?.layers.find(
    (layer) => layer.kind === "vignette",
  );
  expect(vignette).toMatchObject({ vignette: { intensity: 40 } });
  expect(edited.selectedLayerId).toBe(vignette?.id);

  // An answer that arrives after another photo opens leaves the new photo alone.
  await message.fill("brighter");
  await message.press("Enter");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open an image or scene" }).click();
  await (await chooser).setFiles("tests/fixtures/tones.png");
  await expect.poll(async () => (await state()).file).toBe("tones.png");
  release();
  await expect(page.getByText("Another photo opened")).toBeVisible();
  expect(requests[1]).toMatchObject({ earlier: ["darker, with a vignette"] });
  expect((await state()).adjustments.exposure).toBe(0);

  await message.press("Escape");
  await expect(message).toBeHidden();
  await expect(button).toBeFocused();
});
