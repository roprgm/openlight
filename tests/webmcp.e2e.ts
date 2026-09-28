import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

/** Calls a tool as a browser agent does, with its input as JSON. */
function callTool(page: Page, name: string, input: object = {}) {
  return page.evaluate(
    async ([name, input]) => {
      const context = document.modelContext;
      if (!context) throw new Error("WebMCP is unavailable.");
      const tools = await context.getTools();
      const tool = tools.find((tool) => tool.name === name);
      if (!tool) throw new Error(`There is no ${name} tool.`);
      return context.executeTool(tool, JSON.stringify(input));
    },
    [name, input] as const,
  );
}

test("a browser agent edits, masks, crops, undoes, and resets through WebMCP tools", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    async () => (await document.modelContext?.getTools())?.length,
  );
  expect(await callTool(page, "set-adjustments", { exposure: 1 })).toBe(
    "Error: Load an image before editing.",
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "gray.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64"><rect width="128" height="64" fill="#808080"/></svg>',
    ),
  });
  const state = async () => JSON.parse(await callTool(page, "get-state"));
  await expect.poll(async () => (await state()).sourceSize).toEqual([128, 64]);
  const gray = await readImage(page);
  const [image] = (await state()).layers;

  expect(await callTool(page, "set-adjustments", { exposure: 9 })).toMatch(
    /exposure/,
  );
  expect(
    JSON.parse(await callTool(page, "set-adjustments", { exposure: 1 })),
  ).toEqual({ layerId: image.id });
  const brighter = await readImage(page);
  expect(brighter.center[0]).toBeGreaterThan(gray.center[0]);

  await callTool(page, "add-mask", {
    mask: { kind: "linear", start: [0, 0], end: [0, 32] },
    adjustments: { exposure: -2 },
  });
  const readEnds = () =>
    readImage(page, undefined, [
      [64, 2],
      [64, 60],
    ]);
  const masked = await readEnds();
  expect(masked.samples?.[0][0]).toBeLessThan(gray.center[0]);
  expect(masked.samples?.[1]).toEqual(brighter.center);

  expect(await callTool(page, "set-crop", { aspectRatio: 1 })).toBe("Done.");
  expect((await readImage(page)).size).toEqual([64, 64]);
  await callTool(page, "undo");
  expect(await readEnds()).toEqual(masked);

  await callTool(page, "reset");
  expect((await state()).layers).toHaveLength(1);
  expect(await readImage(page)).toEqual(gray);
  await callTool(page, "undo");
  expect(await readEnds()).toEqual(masked);
});
