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

test("a browser agent opens, edits, masks, crops, and resets a photo through WebMCP tools", async ({
  page,
}) => {
  // Another origin, with CORS and no extension, as an agent serves a local file.
  const url = "http://localhost:8123/gray%20card";
  await page.route(url, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      headers: { "access-control-allow-origin": "*" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64"><rect width="128" height="64" fill="#808080"/></svg>',
    }),
  );
  await page.goto("/");
  // Polled from here, since waitForFunction takes a pending promise as truthy.
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await document.modelContext?.getTools())?.length,
      ),
    )
    .toBeGreaterThan(0);
  expect(JSON.parse(await callTool(page, "open-image", { url }))).toMatchObject(
    { file: "gray card", sourceSize: [128, 64] },
  );
  const state = async () => JSON.parse(await callTool(page, "get-state"));
  const gray = await readImage(page);
  const [image] = (await state()).layers;
  expect(
    JSON.parse(await callTool(page, "set-adjustments", { exposure: 1 })),
  ).toEqual({ layerId: image.id });

  // A batch runs in order and stops at its first invalid command, keeping the ones before it.
  expect(
    await callTool(page, "run-commands", {
      commands: [
        {
          type: "add-mask",
          mask: { kind: "linear", start: [0, 0], end: [0, 32] },
          adjustments: { exposure: -2 },
        },
        { type: "set-crop", aspectRatio: 1 },
        { type: "set-adjustments", exposure: 9 },
      ],
    }),
  ).toMatch(/^Error: Command 3 of 3 failed.*exposure/);
  expect((await state()).history.undoCount).toBe(3);
  const edited = await readImage(page, undefined, [
    [32, 2],
    [32, 60],
  ]);
  const [top, bottom] = edited.samples ?? [];
  expect(edited.size).toEqual([64, 64]);
  expect(top[0]).toBeLessThan(gray.center[0]);
  expect(bottom[0]).toBeGreaterThan(gray.center[0]);

  await callTool(page, "reset");
  expect(await readImage(page)).toEqual(gray);
});
