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

test("a browser agent edits, masks, crops, and undoes through WebMCP tools", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    async () => (await document.modelContext?.getTools())?.length,
  );
  expect(await callTool(page, "set_adjustments", { exposure: 1 })).toBe(
    "Error: Load an image before editing.",
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "gray.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64"><rect width="128" height="64" fill="#808080"/></svg>',
    ),
  });
  await expect
    .poll(async () => JSON.parse(await callTool(page, "get_state")).sourceSize)
    .toEqual([128, 64]);
  const gray = await readImage(page);

  expect(await callTool(page, "set_adjustments", { exposure: 9 })).toMatch(
    /exposure/,
  );
  expect(await callTool(page, "set_adjustments", { exposure: 1 })).toBe(
    "Done.",
  );
  const brighter = await readImage(page);
  expect(brighter.center[0]).toBeGreaterThan(gray.center[0]);

  const { layerId } = JSON.parse(
    await callTool(page, "add_mask", {
      mask: { kind: "linear", start: [0, 0], end: [0, 32] },
    }),
  );
  await callTool(page, "set_adjustments", { layerId, exposure: -2 });
  const masked = await readImage(page, undefined, [
    [64, 2],
    [64, 60],
  ]);
  expect(masked.samples?.[0][0]).toBeLessThan(gray.center[0]);
  expect(masked.samples?.[1]).toEqual(brighter.center);

  await callTool(page, "set_crop", { aspectRatio: 1 });
  expect((await readImage(page)).size).toEqual([64, 64]);

  expect(JSON.parse(await callTool(page, "undo"))).toMatchObject({
    undoCount: 3,
    redoCount: 1,
  });
  await callTool(page, "undo");
  await callTool(page, "undo");
  expect(await readImage(page)).toEqual(brighter);
  await callTool(page, "undo");
  expect(await readImage(page)).toEqual(gray);
});
