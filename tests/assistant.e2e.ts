import { expect, test } from "./fixtures";

test("the assistant runs the commands a message returns, selects the layer they edit, and replies", async ({
  page,
}) => {
  const requests: unknown[] = [];
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
    await route.fulfill({
      json: { commands: [], message: "You're welcome!" },
    });
  });
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  const message = page.getByRole("textbox", { name: "Message", exact: true });

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
});
