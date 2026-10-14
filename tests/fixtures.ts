import { test as base, expect, type Page } from "@playwright/test";

export { expect };

/**
 * Expects each channel within `tolerance` of the expected one. GPUs round filtering, `pow`, and
 * float16 differently, so pixel checks compare what a person would see, not exact bytes.
 */
export function expectNear(
  actual: readonly number[] | undefined,
  expected: readonly number[],
  tolerance = 3,
) {
  expect(actual).toHaveLength(expected.length);
  for (const [channel, value] of expected.entries()) {
    expect(
      Math.abs((actual?.[channel] ?? Number.NaN) - value),
      `channel ${channel} of [${actual}] near [${expected}]`,
    ).toBeLessThanOrEqual(tolerance);
  }
}

/** Opens the test photo and waits for its controls. */
export async function openPhoto(page: Page) {
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
}

export const test = base.extend<{ browserErrors: undefined }>({
  browserErrors: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      // Tests run offline: a request beyond the dev server fails the test.
      const origin = new URL(baseURL ?? "").origin;
      await page.route(
        (url) => url.origin !== origin,
        (route) => {
          errors.push(`Request outside the app: ${route.request().url()}`);
          return route.abort();
        },
      );
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      await use(undefined);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
