import { test as base, expect } from "@playwright/test";

export { expect };

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
