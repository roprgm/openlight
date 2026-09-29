import { type ImageFrame, imageFrame } from "@/core/image/frame";
import { expect, openPhoto, test } from "./fixtures";
import { readImage, readPixel } from "./images";
import { box, choose, drag, zoom } from "./pointer";

function expectCentered(
  actual: { x: number; y: number; width: number; height: number },
  expected: typeof actual,
) {
  expect(actual.x + actual.width / 2).toBeCloseTo(
    expected.x + expected.width / 2,
    0,
  );
  expect(actual.y + actual.height / 2).toBeCloseTo(
    expected.y + expected.height / 2,
    0,
  );
}

test("crop, rotate, flip and straighten the photo, then undo", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const state = () => page.evaluate(() => window.openlight.getState());
  await openPhoto(page);
  const canvas = page
    .getByRole("region", { name: "Image canvas" })
    .locator("canvas");
  const output = page
    .getByLabel("output histogram", { exact: true })
    .locator("polyline")
    .first();
  await expect(output).toHaveAttribute("points", /,\d{1,2}\./);
  const original = await canvas.screenshot();
  const histogram = await output.getAttribute("points");
  const open = page.getByRole("tab", { name: "Crop" });
  const panel = page.getByRole("region", { name: "Crop tool" });
  const selection = page.getByRole("application", { name: "Crop selection" });
  const corner = page.getByRole("button", { name: "Resize crop bottom right" });
  const move = page.getByRole("button", { name: "Move crop" });
  const reset = panel.getByRole("button", { name: "Reset", exact: true });
  const aspect = panel.getByRole("combobox", { name: "Aspect ratio" });
  const rotation = panel.getByRole("slider", { name: "Rotation", exact: true });
  async function setFrame(change: Partial<ImageFrame> = {}) {
    const frame = { ...imageFrame([1200, 800]), ...change };
    await page.evaluate((frame) => window.openlight.setFrame(frame), frame);
  }

  async function expectImage(size: number[], corner: number) {
    expect(await readImage(page)).toEqual({
      size,
      center: [128, 128, 128, 255],
      corner: [corner, corner, corner, 255],
    });
  }

  await test.step("Enter activates focused crop panel buttons", async () => {
    const before = await state();
    await open.click();
    await choose(page, aspect, "Square");
    await page
      .getByRole("button", { name: "Close", exact: true })
      .press("Enter");
    await expect(panel).toBeHidden();
    expect((await state()).frame).toEqual(before.frame);
    expect((await state()).history).toEqual(before.history);
    await open.click();
    await panel
      .getByRole("button", { name: "Rotate clockwise" })
      .press("Enter");
    await expect(panel).toBeVisible();
    expect((await state()).frame).toEqual(before.frame);
    await reset.press("Enter");
    await page.getByRole("button", { name: "Apply crop" }).press("Enter");
    await expect(panel).toBeHidden();
    expect((await state()).frame).toEqual(before.frame);
    expect((await state()).history).toEqual(before.history);
  });

  await test.step("locked crop corners resize continuously when the drag changes direction", async () => {
    await setFrame({ size: [600, 400] });
    await open.click();
    const grip = await box(corner);
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 30, y + 19, { steps: 6 });
    const before = await box(selection);
    await page.mouse.move(x - 30, y + 21);
    const after = await box(selection);
    expect(Math.abs(after.width - before.width)).toBeLessThan(6);
    expectCentered(after, before);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.keyboard.press("c");
    const reopened = await box(selection);
    await page.mouse.move(x - 40, y - 40);
    expect(await box(selection)).toEqual(reopened);
    await page.keyboard.press("Escape");
    await setFrame();
  });

  await test.step("44px edge targets resize along one axis and preserve locked ratios", async () => {
    for (const locked of [false, true]) {
      for (const [label, sx, sy] of [
        ["top", 0, -1],
        ["right", 1, 0],
        ["bottom", 0, 1],
        ["left", -1, 0],
      ] as const) {
        await setFrame({ size: [300, 200] });
        await open.click();
        if (!locked) await choose(page, aspect, "Free");
        const bounds = await box(selection);
        const edge = page.getByRole("button", {
          name: `Resize crop ${label}`,
          exact: true,
        });
        const target = await box(edge);
        expect(sx ? target.width : target.height).toBe(44);
        const grip = await box(corner);
        expect([grip.width, grip.height]).toEqual([44, 44]);
        const x =
          bounds.x + bounds.width * (sx ? (sx + 1) / 2 : 0.35) + sx * 20;
        const y =
          bounds.y + bounds.height * (sy ? (sy + 1) / 2 : 0.35) + sy * 20;
        await drag(
          page,
          [x, y],
          [x - sx * 30 + Math.abs(sy) * 15, y - sy * 30 + Math.abs(sx) * 15],
        );
        const resized = await box(selection);
        const widthChange = sx ? 60 : Number(locked) * 90;
        const heightChange = sy ? 60 : Number(locked) * 40;
        expect(resized.width).toBeCloseTo(bounds.width - widthChange, 0);
        expect(resized.height).toBeCloseTo(bounds.height - heightChange, 0);
        expectCentered(resized, bounds);
        await page.getByRole("button", { name: "Apply crop" }).click();
        const frame = (await state()).frame;
        if (!frame) throw new Error("Missing cropped frame");
        const exported = await readImage(page);
        expect(exported.size).toEqual(frame.size.map(Math.round));
        expect(exported.center).toEqual([128, 128, 128, 255]);
      }
    }
    await setFrame();
  });

  await test.step("crop drafts cancel, apply once, rotate and straighten without losing the source", async () => {
    const before = await state();
    await expect(output).toHaveAttribute("points", histogram ?? "");
    await open.click();
    await expect(aspect).toContainText("Original");
    await choose(page, aspect, "Square");
    const bounds = await box(selection);
    await drag(
      page,
      [bounds.x + bounds.width, bounds.y + bounds.height],
      [bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.8],
    );
    const beforeZoom = await box(selection);
    expect(beforeZoom.width).toBeLessThan(bounds.width);
    expect(beforeZoom.width).toBeCloseTo(beforeZoom.height, 4);
    expectCentered(beforeZoom, bounds);
    await corner.hover();
    await zoom(page, Math.exp(0.4));
    await expect
      .poll(async () => (await box(selection)).width)
      .toBeGreaterThan(beforeZoom.width * 1.4);
    const zoomed = await box(selection);
    const grip = await box(corner);
    await drag(
      page,
      [grip.x + grip.width / 2, grip.y + grip.height / 2],
      [grip.x + grip.width / 2 - 20, grip.y + grip.height / 2 - 20],
      4,
    );
    const resized = await box(selection);
    expect(resized.width).toBeCloseTo(zoomed.width - 40, 0);
    const beforePan = await box(selection);
    expectCentered(beforePan, zoomed);
    await page.mouse.wheel(30, 20);
    await expect
      .poll(async () => (await box(selection)).x)
      .not.toBe(beforePan.x);
    expect((await box(selection)).width).toBe(resized.width);
    await move.press("Shift+ArrowRight");
    for (const gap of [20, 24]) {
      const frame = await box(selection);
      const x = frame.x + frame.width + gap;
      const y = frame.y + frame.height / 2;
      await page.mouse.move(x, y);
      expect(
        await page.evaluate(
          ({ x, y }) => {
            const element = document.elementFromPoint(x, y);
            return element && getComputedStyle(element).cursor;
          },
          { x, y },
        ),
      ).toContain(gap < 22 ? "ew-resize" : "url(");
      await page.mouse.down();
      await page.mouse.move(
        x,
        y + (frame.width / 2 + gap) * Math.tan(Math.PI / 6),
        { steps: 8 },
      );
      await page.mouse.up();
      const angle = await rotation.inputValue();
      expect(Number(angle)).toBeCloseTo(gap < 22 ? 0 : 30, 0);
      expect(await box(selection)).toEqual(frame);
      await page.mouse.move(x + 20, y);
      await expect(rotation).toHaveValue(angle);
    }
    expect((await readImage(page)).size).toEqual([1200, 800]);
    await page.keyboard.press("Escape");
    expect((await state()).frame).toEqual(before.frame);
    expect((await state()).history).toEqual(before.history);
    await open.focus();
    await page.keyboard.press("c");
    await choose(page, aspect, "Square");
    await corner.press("Enter");
    await expect(panel).toBeHidden();
    await expectImage([800, 800], 128);
    await expect(output).not.toHaveAttribute("points", histogram ?? "");
    expect((await state()).history.undoCount).toBe(
      before.history.undoCount + 1,
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await readImage(page)).size).toEqual([1200, 800]);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    expect((await readImage(page)).size).toEqual([800, 800]);
    await open.click();
    await reset.click();
    await panel
      .getByRole("button", { name: "Rotate counterclockwise" })
      .click();
    await corner.press("Enter");
    await expectImage([800, 1200], 224);
    await open.click();
    await panel.getByRole("button", { name: "Rotate clockwise" }).click();
    await panel.getByRole("button", { name: "Rotate clockwise" }).click();
    await page.getByRole("button", { name: "Apply crop" }).click();
    await expectImage([800, 1200], 32);
    await open.click();
    await reset.click();
    const angle = panel.getByRole("textbox", {
      name: "Rotation",
      exact: true,
    });
    await angle.fill("30");
    await angle.press("Enter");
    await expect(panel).toBeHidden();
    await expectImage([1200, 800], 32);
    await open.click();
    await reset.click();
    await page.getByRole("button", { name: "Apply crop" }).click();
    await expect.poll(() => canvas.screenshot()).toEqual(original);
  });

  await test.step("flip controls mirror pixels, preserve framing, and support undo", async () => {
    for (const [axis, value] of [
      ["horizontal", 224],
      ["vertical", 224],
      ["horizontal", 32],
      ["vertical", 0],
    ] as const) {
      const pixel = [value, value, value, 255];
      await open.click();
      const bounds = await box(selection);
      await page.getByRole("button", { name: `Flip ${axis}` }).click();
      expect(await box(selection)).toEqual(bounds);
      const corner = {
        x: bounds.x + 10,
        y: bounds.y + 10,
      };
      await expect
        .poll(async () => await readPixel(page, corner))
        .toEqual(pixel);
      await page.getByRole("button", { name: "Apply crop" }).click();
      expect((await readImage(page)).corner).toEqual(pixel);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      expect((await readImage(page)).corner).toEqual(pixel);
    }
  });

  await test.step("cropping preserves framing, moves the image, and rotates around the crop center", async () => {
    const sidebar = page.getByRole("complementary");
    const sidebarBefore = await box(sidebar);
    await drag(
      page,
      [sidebarBefore.x - 2, sidebarBefore.y + 40],
      [sidebarBefore.x - 82, sidebarBefore.y + 40],
    );
    const resizedSidebar = await box(sidebar);
    expect(resizedSidebar.width).toBe(sidebarBefore.width + 80);
    await setFrame({ center: [360, 200], size: [240, 240] });
    const viewport = await box(canvas);
    await open.click();
    expect(await box(sidebar)).toEqual(resizedSidebar);
    const bounds = await box(selection);
    // A 240px crop starts at 200%, centered exactly where it was before opening the tool.
    expect(bounds.width).toBeCloseTo(480, 0);
    expect(bounds.height).toBeCloseTo(480, 0);
    expect(bounds.x).toBeCloseTo(viewport.x + (viewport.width - 480) / 2, 0);
    expect(bounds.y).toBeCloseTo(viewport.y + (viewport.height - 480) / 2, 0);
    const sample = {
      x: bounds.x + 40,
      y: bounds.y + bounds.height / 2,
    };
    expect(await readPixel(page, sample)).toEqual([48, 80, 128, 255]);
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    const beforePan = await state();
    for (const [startX, startY] of [
      [x, y],
      [bounds.x, bounds.y],
      [bounds.x + bounds.width, y],
      [bounds.x + bounds.width + 12, y],
      [bounds.x + bounds.width + 60, y],
    ]) {
      await page.mouse.move(startX, startY);
      await page.keyboard.down("Space");
      await expect(
        page.getByRole("button", { name: "Resize crop top left" }),
      ).toHaveCSS("cursor", "grab");
      await page.mouse.down();
      await page.mouse.move(startX + 40, startY + 20, { steps: 4 });
      await page.mouse.up();
      await page.keyboard.up("Space");
      expect(await box(selection)).toEqual({
        ...bounds,
        x: bounds.x + 40,
        y: bounds.y + 20,
      });
      expect(await state()).toEqual(beforePan);
      expect(
        await readPixel(page, {
          ...sample,
          x: sample.x + 40,
          y: sample.y + 20,
        }),
      ).toEqual([48, 80, 128, 255]);
      await page.keyboard.down("Space");
      await page.mouse.down();
      await page.mouse.move(startX, startY, { steps: 4 });
      await page.mouse.up();
      await page.keyboard.up("Space");
    }
    await page.mouse.move(x, y);
    await expect(move).toHaveCSS("cursor", "grab");
    await page.mouse.down();
    await expect(move).toHaveCSS("cursor", "grabbing");
    await page.mouse.move(x + 80, y + 30, { steps: 8 });
    await page.mouse.up();
    expect(await box(selection)).toEqual(bounds);
    expect(await readPixel(page, sample)).toEqual([128, 128, 128, 255]);
    await drag(
      page,
      [bounds.x + bounds.width + 60, y],
      [
        bounds.x + bounds.width + 60,
        y + (bounds.width / 2 + 60) * Math.tan(Math.PI / 6),
      ],
      8,
    );
    expect(await box(selection)).toEqual(bounds);
    expect(Number(await rotation.inputValue())).toBeCloseTo(30, 0);
    const center = { x, y };
    expect(await readPixel(page, center)).toEqual([48, 80, 128, 255]);
    await page.keyboard.press("Enter");
    expect(await box(sidebar)).toEqual(resizedSidebar);
    expect((await readImage(page)).center).toEqual([48, 80, 128, 255]);
    await canvas.hover();
    await zoom(page, 2.5);
    await page.mouse.wheel(30, 20);
    const before = await readPixel(page, center);
    await open.click();
    const zoomed = await box(selection);
    expect(zoomed.width).toBeCloseTo(1200, 0);
    expect(zoomed.x).toBeCloseTo(
      viewport.x + (viewport.width - 1200) / 2 - 30,
      0,
    );
    expect(zoomed.y).toBeCloseTo(
      viewport.y + (viewport.height - 1200) / 2 - 20,
      0,
    );
    expect(await readPixel(page, center)).toEqual(before);
    await drag(page, [x, y], [x + 80, y + 30], 8);
    await page.keyboard.press("Enter");
    await open.click();
    expect(await box(selection)).toEqual(bounds);
    await page.keyboard.press("Escape");
    expect(await box(sidebar)).toEqual(resizedSidebar);
    await drag(
      page,
      [resizedSidebar.x - 2, resizedSidebar.y + 40],
      [sidebarBefore.x - 2, sidebarBefore.y + 40],
    );
    await setFrame();
  });

  await test.step("straightened crops leave empty space outside the source and reset restores geometry and camera", async () => {
    await setFrame({ size: [600, 400], angle: 30 });
    await open.click();
    await move.hover();
    await zoom(page, 0.5);
    const bounds = await box(selection);
    const outside = {
      x: bounds.x - bounds.width * 0.46,
      y: bounds.y - bounds.height * 0.46,
    };
    const pixel = async () => await readPixel(page, outside);
    await expect.poll(pixel).toEqual([9, 9, 9, 255]);
    await zoom(page, 0.5);
    const smaller = await box(selection);
    // Known light patch rotated beyond the original source rectangle.
    const revealed = {
      x: smaller.x + smaller.width * 1.535,
      y: smaller.y + smaller.height * 0.542,
    };
    await expect
      .poll(async () => await readPixel(page, revealed))
      .toEqual([90, 90, 90, 255]);
    await reset.click();
    await expect.poll(pixel).toEqual([0, 0, 0, 255]);
    const fitted = await box(selection);
    const viewport = await box(canvas);
    const fit = Math.min(
      (viewport.width - 48) / 1200,
      (viewport.height - 48) / 800,
      2,
    );
    expect(fitted.width).toBeCloseTo(1200 * fit, 0);
    expect(fitted.height).toBeCloseTo(800 * fit, 0);
    expectCentered(fitted, viewport);
    await page.getByRole("button", { name: "Rotate clockwise" }).click();
    await move.hover();
    await zoom(page, Math.exp(0.8));
    await page.mouse.wheel(60, 40);
    await reset.click();
    expect(await box(selection)).toEqual(fitted);
    await expect(
      page.getByRole("slider", { name: "Rotation", exact: true }),
    ).toHaveValue("0");
    await expect(aspect).toContainText("Original");
    await choose(page, aspect, "Square");
    const fixed = await box(selection);
    for (const direction of [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
    ]) {
      for (let i = 0; i < 20; i++) await move.press(`Shift+${direction}`);
      const actual = await box(selection);
      expect(actual.x).toBeCloseTo(fixed.x, 0);
      expect(actual.y).toBeCloseTo(fixed.y, 0);
    }
    await page.keyboard.press("Escape");
  });
});
