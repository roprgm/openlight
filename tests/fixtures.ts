import { basename } from "node:path";
import {
  type BrowserContext,
  test as base,
  type ConsoleMessage,
  expect,
  type Page,
  type Route,
} from "@playwright/test";

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

/** Shows the editor, loading it only when the page is not already on it. */
export async function openApp(page: Page) {
  const ready = await page.evaluate(
    () =>
      location.pathname === "/" && !location.search && "openlight" in window,
  );
  if (!ready) {
    await page.goto("/");
    await page.waitForFunction(() => window.openlight);
  }
}

/** Opens an image as a new document: a fixture path served by the dev server, or a file's contents. */
export async function openImage(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await openApp(page);
  const failure = await page.evaluate(
    async ([file]) => {
      const api = window.openlight;
      if (typeof file === "string") {
        await api.loadUrl(`/${file}`);
      } else {
        await api.loadImage(
          new File([new Uint8Array(file.bytes)], file.name, {
            type: file.mimeType,
          }),
        );
      }
      return api.getState().failure;
    },
    [
      typeof file === "string"
        ? file
        : { name: file.name, mimeType: file.mimeType, bytes: [...file.buffer] },
    ] as const,
  );
  expect(
    failure,
    `open ${typeof file === "string" ? basename(file) : file.name}`,
  ).toBeUndefined();
}

/** Opens the test photo and waits for its controls. */
export async function openPhoto(page: Page) {
  await openImage(page, "tests/fixtures/photo.svg");
  await expect(
    page.getByRole("textbox", { name: "Exposure", exact: true }),
  ).toHaveValue("0.00");
}

/** Expects each pixel near its expected one, as `expectNear` does. */
export function expectPixels(
  actual: readonly (readonly number[])[] | undefined,
  expected: readonly (readonly number[])[],
  tolerance?: number,
) {
  expect(actual).toHaveLength(expected.length);
  for (const [i, pixel] of expected.entries()) {
    expectNear(actual?.[i], pixel, tolerance);
  }
}

/**
 * Each worker loads the editor once and its tests share the page: opening an image starts a new
 * document, which the editor mounts afresh. A test that changes the page itself, with routes,
 * init scripts, a fake clock, or touch, sets `isolated` for a page of its own; a failure drops the
 * shared page so the next test starts clean.
 */
export const test = base.extend<
  { isolated: boolean; browserErrors: undefined },
  { shared: { context: BrowserContext; page?: Page } }
>({
  isolated: [false, { option: true }],
  shared: [
    async ({ browser }, use, workerInfo) => {
      const context = await browser.newContext({
        baseURL: workerInfo.project.use.baseURL,
      });
      await use({ context });
      await context.close();
    },
    { scope: "worker" },
  ],
  page: async (
    { context, viewport, hasTouch, isolated, shared },
    use,
    testInfo,
  ) => {
    if (isolated || hasTouch) {
      await use(await context.newPage());
      return;
    }
    shared.page ??= await shared.context.newPage();
    const page = shared.page;
    if (viewport) {
      await page.setViewportSize(viewport);
    }
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus) {
      shared.page = undefined;
      await page.close();
    }
  },
  browserErrors: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      // Tests run offline: a request beyond the dev server fails the test.
      const origin = new URL(baseURL ?? "").origin;
      const outside = (url: URL) => url.origin !== origin;
      const abort = (route: Route) => {
        errors.push(`Request outside the app: ${route.request().url()}`);
        return route.abort();
      };
      const pageError = (error: Error) => errors.push(error.message);
      const consoleError = (message: ConsoleMessage) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      };
      await page.route(outside, abort);
      page.on("pageerror", pageError);
      page.on("console", consoleError);
      await use(undefined);
      page.off("pageerror", pageError);
      page.off("console", consoleError);
      await page.unroute(outside, abort);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
