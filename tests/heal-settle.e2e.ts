import { expect, test } from "./fixtures";
import { box } from "./pointer";

for (const gesture of ["stroke", "destination"] as const) {
  test(`Remove ${gesture} survives a background painting settle and commits on release`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles({
      name: "small.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="66"><rect width="64" height="66" fill="#808080"/></svg>',
      ),
    });
    await expect(
      page.getByRole("textbox", { name: "Exposure", exact: true }),
    ).toHaveValue("0.00");
    const paint = await page.evaluate(() => {
      const id = window.openlight.addLayer("paint");
      window.openlight.setLayer(id, { visible: false });
      return id;
    });
    await page.keyboard.press("h");
    const canvas = page.getByLabel("Healing canvas", { exact: true });
    const size = page.getByRole("textbox", { name: "Size", exact: true });
    await size.fill("20");
    await size.press("Enter");
    const bounds = await box(canvas);
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    if (gesture === "destination") await page.mouse.click(x, y);
    await page.evaluate((id) => {
      // The 32x33 rgba8 painting reads 33 rows aligned to 256 bytes.
      const prototype: GPUBuffer = Reflect.get(
        globalThis,
        "GPUBuffer",
      ).prototype;
      const map = prototype.mapAsync;
      const gate = new Promise<void>((resolve) => {
        window.addEventListener("release-paint-settle", () => resolve(), {
          once: true,
        });
      });
      prototype.mapAsync = async function (...args) {
        const reading = map.apply(this, args);
        if (args[2] !== 256 * 33) return reading;
        prototype.mapAsync = map;
        document.documentElement.dataset.paintSettle = "held";
        await reading;
        await gate;
      };
      for (let i = 0; i < 100; i++) {
        window.openlight.addPaintStroke(id, {
          mode: "paint",
          size: 8,
          feather: 0,
          flow: 1,
          color: "#000000",
          points: [[10, 10, 1]],
        });
      }
    }, paint);
    await expect(page.locator("html")).toHaveAttribute(
      "data-paint-settle",
      "held",
    );
    const target =
      gesture === "stroke"
        ? canvas
        : canvas.locator('[data-heal-destination-handle="true"]');
    const handle = await box(target);
    const start =
      gesture === "stroke"
        ? { x, y }
        : { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 20, { steps: 4 });
    const preview = canvas.locator('[data-heal-stroke-preview="true"]');
    if (gesture === "stroke") await expect(preview).toBeVisible();
    const before = await page.evaluate(() => window.openlight.getState());
    const position = await box(target);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("release-paint-settle")),
    );
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const layer = window.openlight
            .getState()
            .scene?.layers.find((l) => l.id === id);
          return layer?.kind === "paint" && layer.strokes.length === 0;
        }, paint),
      )
      .toBe(true);
    if (gesture === "stroke") await expect(preview).toBeVisible();
    else expect((await box(target)).x).toBeCloseTo(position.x);
    await page.mouse.move(start.x + 60, start.y + 30);
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
    const state = await page.evaluate(() => window.openlight.getState());
    const layer = state.scene?.layers.find((l) => l.kind === "heal");
    expect(layer?.kind === "heal" && layer.patches.length).toBe(1);
    if (layer?.kind !== "heal") throw Error("Healing layer missing.");
    if (gesture === "stroke")
      expect(layer.patches[0].strokes[0].points.length).toBeGreaterThan(1);
    else {
      const original = before.scene?.layers.find((l) => l.kind === "heal");
      expect(layer.patches[0].strokes).not.toEqual(
        original?.kind === "heal" && original.patches[0].strokes,
      );
    }
    await page.evaluate(() => window.openlight.undo());
    const undone = await page.evaluate(() =>
      window.openlight.getState().scene?.layers.find((l) => l.kind === "heal"),
    );
    const original = before.scene?.layers.find((l) => l.kind === "heal");
    expect(undone?.kind === "heal" && undone.patches).toEqual(
      original?.kind === "heal" && original.patches,
    );
  });
}
