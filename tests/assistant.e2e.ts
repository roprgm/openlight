import { expect, test } from "./fixtures";

test("the assistant opens, runs the commands a message returns on the photo it was sent for, selects the layer they edit, replies, and closes", async ({
  page,
}) => {
  const requests: unknown[] = [];
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/assistant", async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 3) {
      await released;
      await route.fulfill({
        json: {
          commands: [{ type: "set-adjustments", exposure: 2 }],
          message: "exposure 0 → 2",
        },
      });
      return;
    }
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
    await route.fulfill({
      json: { commands: [], message: "You're welcome!" },
    });
  });
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(message).toBeFocused();

  await message.fill("darker, with a vignette");
  await message.press("Enter");
  await expect(
    page.getByText("exposure 0 → -1, vignette 0 → 40"),
  ).toBeVisible();
  expect(requests[0]).toMatchObject({
    message: "darker, with a vignette",
    earlier: [],
    photo: { sourceSize: [1200, 800], comparison: "edited" },
  });
  const state = await page.evaluate(() => window.openlight.getState());
  expect(state.adjustments.exposure).toBe(-1);
  const vignette = state.scene?.layers.find(
    (layer) => layer.kind === "vignette",
  );
  expect(vignette).toMatchObject({ vignette: { intensity: 40 } });
  expect(state.selectedLayerId).toBe(vignette?.id);

  await message.fill("thanks");
  await message.press("Enter");
  await expect(page.getByText("You're welcome!")).toBeVisible();
  expect(requests[1]).toMatchObject({ earlier: ["darker, with a vignette"] });

  // An answer that arrives after another photo opens leaves the new photo alone.
  await message.fill("brighter");
  await message.press("Enter");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/tones.png");
  await expect
    .poll(() => page.evaluate(() => window.openlight.getState().file))
    .toBe("tones.png");
  release();
  await expect(
    page.getByText(
      "Another photo opened before the answer came, so I left it unedited.",
    ),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => window.openlight.getState())).adjustments
      .exposure,
  ).toBe(0);

  await message.press("Escape");
  await expect(message).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Assistant", exact: true }),
  ).toBeFocused();
});
