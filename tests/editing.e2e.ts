import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { type ImageFrame, imageFrame } from "@/lib/image-frame/geometry";
import { interpolatePchip } from "@/lib/math";
import { expect, test } from "./fixtures";
import { readImage, readPixel, readPreview } from "./images";

async function box(locator: Locator) {
	const bounds = await locator.boundingBox();
	if (!bounds) throw new Error(`Missing bounds for ${locator}`);
	return bounds;
}

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

async function drag(page: Page, from: number[], to: number[], steps = 8) {
	await page.mouse.move(from[0], from[1]);
	await page.mouse.down();
	await page.mouse.move(to[0], to[1], { steps });
	await page.mouse.up();
}

async function zoom(page: Page, factor: number) {
	await page.keyboard.down("Control");
	await page.mouse.wheel(0, -Math.log(factor) * 100);
	await page.keyboard.up("Control");
}

test("edit a photo, inspect the preview and histograms, undo changes, and export", async ({
	page,
	browser,
}) => {
	const state = () => page.evaluate(() => window.openlight.getState());
	await page.goto("/");
	await expect(page.getByRole("button", { name: "Open image" })).toBeVisible();
	await page
		.locator('input[type="file"]')
		.setInputFiles("tests/fixtures/photo.svg");
	const canvas = page.locator("canvas");
	const output = page
		.getByLabel("output histogram", { exact: true })
		.locator("polyline")
		.first();
	await expect(
		page.getByLabel("output histogram", { exact: true }).locator("polygon"),
	).toHaveCount(3);
	await expect(output).toHaveAttribute("points", /,\d{1,2}\./);
	const original = await canvas.screenshot();
	const histogram = await output.getAttribute("points");
	const initial = await state();
	expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);

	await test.step("zoomed rendering reaches the edges of the editor viewport", async () => {
		const viewport = await page
			.getByRole("region", { name: "Image canvas" })
			.boundingBox();
		if (!viewport) throw new Error("Missing editor viewport.");
		expect(await canvas.boundingBox()).toEqual(viewport);
		await canvas.hover();
		await zoom(page, 2);
		const edge = {
			x: viewport.x + viewport.width / 2,
			y: viewport.y + 4,
			width: 1,
			height: 1,
		};
		await expect
			.poll(async () => await readPixel(page, edge))
			.toEqual([128, 128, 128, 255]);
		await canvas.dblclick();
		await expect.poll(() => canvas.screenshot()).toEqual(original);
	});

	await test.step("Space panning continues smoothly after releasing the key mid-drag", async () => {
		const viewport = await canvas.boundingBox();
		if (!viewport) throw new Error("Missing canvas.");
		const scale = Math.min(
			(viewport.width - 48) / 1200,
			(viewport.height - 48) / 800,
			2,
		);
		const sample = {
			x: viewport.x + viewport.width / 2 + (430 - 600) * scale,
			y: viewport.y + viewport.height / 2 + (150 - 400) * scale,
			width: 1,
			height: 1,
		};
		expect(await readPixel(page, sample)).toEqual([48, 80, 128, 255]);
		await canvas.hover();
		await page.keyboard.down("Space");
		await page.mouse.down();
		await page.mouse.move(
			viewport.x + viewport.width / 2 + 100,
			viewport.y + viewport.height / 2,
		);
		await page.keyboard.up("Space");
		await page.mouse.move(
			viewport.x + viewport.width / 2 + 101,
			viewport.y + viewport.height / 2,
		);
		await page.mouse.up();
		await expect
			.poll(async () => await readPixel(page, { ...sample, x: sample.x + 101 }))
			.toEqual([48, 80, 128, 255]);
		expect(await state()).toEqual(initial);
		await canvas.dblclick();
		await expect.poll(() => canvas.screenshot()).toEqual(original);
	});

	await test.step("exposure moves the preview and RGB histogram, then resets", async () => {
		const exposure = page.getByRole("slider", {
			name: "Exposure",
			exact: true,
		});
		await exposure.focus();
		await page.keyboard.down("ArrowRight");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.up("ArrowRight");
		expect((await state()).history.undoCount).toBe(1);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		await expect(exposure).toHaveValue("0");
		const bounds = await exposure.boundingBox();
		if (!bounds) throw new Error("Exposure slider is missing.");
		await drag(
			page,
			[bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
			[bounds.x + bounds.width * 0.6, bounds.y + bounds.height / 2],
			8,
		);
		expect((await state()).history.undoCount).toBe(1);
		await expect.poll(() => canvas.screenshot()).not.toEqual(original);
		await expect(output).not.toHaveAttribute("points", histogram ?? "");
		expect((await readImage(page)).center[0]).toBeGreaterThan(160);
		await page.keyboard.press("ControlOrMeta+z");
		await expect.poll(() => canvas.screenshot()).toEqual(original);
		await page.keyboard.press("ControlOrMeta+Shift+z");
		await expect.poll(() => canvas.screenshot()).not.toEqual(original);
		await exposure.dblclick();
		await expect(exposure).toHaveValue("0");
		await expect(output).toHaveAttribute("points", histogram ?? "");
		await expect.poll(() => canvas.screenshot()).toEqual(original);
	});

	await test.step("compare and clipping change only the preview", async () => {
		await page.evaluate(() => {
			window.openlight.setAdjustments({ exposure: 3 });
			window.openlight.setToneCurve([
				{ x: 0, y: 0 },
				{ x: 0.5, y: 1 },
				{ x: 1, y: 1 },
			]);
		});
		const before = page.getByRole("button", {
			name: "Compare before and after",
			exact: true,
		});
		const shadows = page.getByRole("button", { name: "Show clipped shadows" });
		const highlights = page.getByRole("button", {
			name: "Show clipped highlights",
		});
		const edited = await readImage(page);
		const history = (await state()).history;
		const bins = await output.getAttribute("points");
		await before.focus();
		await page.keyboard.down("Backslash");
		await expect(before).toHaveAttribute("aria-pressed", "true");
		await expect
			.poll(async () => (await readPreview(page)).center)
			.toEqual([128, 128, 128, 255]);
		await page.keyboard.up("Backslash");
		await expect
			.poll(async () => (await readPreview(page)).center)
			.toEqual([255, 255, 255, 255]);
		await before.click();
		const divider = page.getByRole("slider", {
			name: "Before and after divider",
		});
		await expect(divider).toHaveAttribute("aria-valuenow", "50");
		const bounds = await canvas.boundingBox();
		if (!bounds) throw new Error("Preview is missing.");
		await divider.hover();
		await page.mouse.down();
		await page.mouse.move(
			bounds.x + bounds.width * 0.8,
			bounds.y + bounds.height / 2,
			{ steps: 8 },
		);
		await page.mouse.up();
		await expect(divider).toHaveAttribute("aria-valuenow", "80");
		await expect
			.poll(async () => (await readPreview(page)).center)
			.toEqual([128, 128, 128, 255]);
		await divider.press("Home");
		await expect
			.poll(async () => (await readPreview(page)).center)
			.toEqual([255, 255, 255, 255]);
		await divider.press("End");
		await expect
			.poll(async () => (await readPreview(page)).center)
			.toEqual([128, 128, 128, 255]);
		await divider.press("Shift+ArrowLeft");
		await expect(divider).toHaveAttribute("aria-valuenow", "90");
		await page.keyboard.down("Backslash");
		await expect(divider).toBeHidden();
		await page.keyboard.up("Backslash");
		await expect(divider).toHaveAttribute("aria-valuenow", "90");
		await before.click();
		await expect(divider).toBeHidden();
		await page.keyboard.down("Backslash");
		await page.evaluate(() => window.dispatchEvent(new Event("blur")));
		await expect(before).toHaveAttribute("aria-pressed", "false");
		await page.keyboard.up("Backslash");
		const field = page.getByRole("textbox", { name: "Exposure", exact: true });
		await field.focus();
		await page.keyboard.press("Backslash");
		await expect(before).toHaveAttribute("aria-pressed", "false");
		await field.press("Escape");
		await shadows.click();
		await expect
			.poll(async () => (await readPreview(page)).blue)
			.toBeGreaterThan(100);
		await highlights.click();
		await expect
			.poll(async () => (await readPreview(page)).center)
			.toEqual([255, 0, 0, 255]);
		await expect
			.poll(async () => (await readPreview(page)).blue)
			.toBeGreaterThan(100);
		await before.click();
		await expect
			.poll(async () => (await readPreview(page)).center)
			.toEqual([128, 128, 128, 255]);
		expect(await readImage(page)).toEqual(edited);
		expect((await state()).history).toEqual(history);
		await expect(output).toHaveAttribute("points", bins ?? "");
		await page.evaluate(() =>
			window.openlight.setPreview({
				comparison: "edited",
				shadows: false,
				highlights: false,
			}),
		);
		await expect(highlights).toHaveAttribute("aria-pressed", "false");
		await expect.poll(async () => (await readPreview(page)).blue).toBe(0);
		await page.evaluate(() => {
			window.openlight.setAdjustments({ exposure: 0 });
			window.openlight.setToneCurve();
		});
		await expect.poll(() => canvas.screenshot()).toEqual(original);
	});

	await test.step("light and color controls render together and reset", async () => {
		for (const [label, value] of [
			["Highlights", -50],
			["Shadows", 50],
			["Whites", 25],
			["Blacks", -25],
		] as const) {
			const field = page.getByRole("textbox", { name: label, exact: true });
			await field.fill(String(value));
			await field.press("Enter");
			await expect(
				page.getByRole("slider", { name: label, exact: true }),
			).toHaveValue(String(value));
		}
		await page.evaluate(() =>
			window.openlight.setAdjustments({
				contrast: 20,
				incrementalTemperature: 15,
				incrementalTint: -10,
				vibrance: 30,
				saturation: -20,
			}),
		);
		await expect.poll(() => canvas.screenshot()).not.toEqual(original);
		await expect(output).not.toHaveAttribute("points", histogram ?? "");
		const edited = await readImage(page);
		expect(edited.center).not.toEqual([128, 128, 128, 255]);
		await page.evaluate(
			(adjustments) => window.openlight.setAdjustments(adjustments),
			initial.adjustments,
		);
		await expect.poll(() => canvas.screenshot()).toEqual(original);
	});

	await test.step("clarity changes local contrast and histogram, then undoes and resets", async () => {
		const field = page.getByRole("textbox", { name: "Clarity", exact: true });
		const slider = page.getByRole("slider", { name: "Clarity", exact: true });
		await field.fill("100");
		await field.press("Enter");
		await expect(slider).toHaveValue("100");
		await expect(output).not.toHaveAttribute("points", histogram ?? "");
		const positive = await readImage(page);
		expect(positive.center).toEqual([128, 128, 128, 255]);
		expect(positive.corner).toEqual([0, 0, 0, 255]);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		await expect(slider).toHaveValue("0");
		expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
		await field.fill("-100");
		await field.press("Enter");
		expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);
		expect((await readImage(page)).corner[0]).toBeGreaterThan(0);
		await slider.dblclick();
		await expect(slider).toHaveValue("0");
		await expect(output).toHaveAttribute("points", histogram ?? "");
	});

	await test.step("curve gestures change output after adjustments and undo as one edit", async () => {
		await page.evaluate(() =>
			window.openlight.setAdjustments({ exposure: -1 }),
		);
		const adjusted = await readImage(page);
		const graph = page.getByRole("application", { name: "Tone curve" });
		await graph.scrollIntoViewIfNeeded();
		const input = page
			.getByLabel("input histogram", { exact: true })
			.locator("polyline");
		await expect(input).toHaveAttribute("points", /,\d{1,2}\./);
		const inputBefore = await input.getAttribute("points");
		const before = await page.evaluate(
			() => window.openlight.getState().history.undoCount,
		);
		const bounds = await graph.boundingBox();
		if (!bounds) throw new Error("Curve graph is missing.");
		await drag(
			page,
			[bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
			[bounds.x + bounds.width / 2, bounds.y + bounds.height / 4],
			8,
		);
		await expect(graph.locator("circle")).toHaveCount(3);
		expect((await state()).history.undoCount).toBe(before + 1);
		await expect(input).toHaveAttribute("points", inputBefore ?? "");
		const curved = await readImage(page);
		const curve = await page.evaluate(
			() => window.openlight.getState().toneCurve,
		);
		const expected = interpolatePchip(curve)(adjusted.center[0] / 255) * 255;
		expect(Math.abs(curved.center[0] - expected)).toBeLessThan(2);
		await page.keyboard.press("ControlOrMeta+z");
		expect(await readImage(page)).toEqual(adjusted);
		await page.keyboard.press("ControlOrMeta+Shift+z");
		expect(await readImage(page)).toEqual(curved);
		await graph.press("Shift+ArrowDown");
		await graph.press("Delete");
		await expect(graph.locator("circle")).toHaveCount(2);
		expect(await readImage(page)).toEqual(adjusted);
		await graph.press("Enter");
		await graph.press("ArrowUp");
		await expect(graph.locator("circle")).toHaveCount(3);
		await page.getByRole("button", { name: "Reset curve" }).click();
		await expect(graph.locator("circle")).toHaveCount(2);
		await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0 }));
		await expect.poll(() => canvas.screenshot()).toEqual(original);
		for (const { from, to, sample, expected } of [
			{ from: [0, 1], to: [0, 0.75], sample: "corner", expected: 64 },
			{ from: [1, 0], to: [0.1, 0], sample: "center", expected: 255 },
		] as const) {
			await drag(
				page,
				[bounds.x + from[0] * bounds.width, bounds.y + from[1] * bounds.height],
				[bounds.x + to[0] * bounds.width, bounds.y + to[1] * bounds.height],
				5,
			);
			expect(
				Math.abs((await readImage(page))[sample][0] - expected),
			).toBeLessThan(2);
			await graph.dblclick({
				position: { x: to[0] * bounds.width, y: to[1] * bounds.height },
			});
			expect(
				await page.evaluate(() => window.openlight.getState().toneCurve),
			).toEqual(initial.toneCurve);
		}
	});

	const open = page.getByRole("button", { name: "Crop and rotate" });
	const panel = page.getByRole("region", { name: "Crop tool" });
	const selection = page.getByRole("application", { name: "Crop selection" });
	const corner = page.getByRole("button", { name: "Resize crop bottom right" });
	const move = page.getByRole("button", { name: "Move crop" });
	const reset = panel.getByRole("button", { name: "Reset", exact: true });
	const aspect = panel.getByRole("combobox", { name: "Aspect ratio" });
	const rotation = panel.getByRole("slider", { name: "Rotation", exact: true });
	async function setFrame(change: Partial<ImageFrame> = {}) {
		const frame = { ...imageFrame([1200, 800]), ...change };
		await page.evaluate(
			(frame) => window.openlight.editScene({ frame }),
			frame,
		);
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
		await aspect.selectOption({ label: "Square" });
		await panel
			.getByRole("button", { name: "Cancel", exact: true })
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
		await panel.getByRole("button", { name: "Apply crop" }).press("Enter");
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
				if (!locked) await aspect.selectOption({ label: "Free" });
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
				await panel.getByRole("button", { name: "Apply crop" }).click();
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
		await expect(aspect).toHaveValue("1.5");
		await aspect.selectOption({ label: "Square" });
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
		await aspect.selectOption({ label: "Square" });
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
		await panel.getByRole("button", { name: "Apply crop" }).click();
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
		await panel.getByRole("button", { name: "Apply crop" }).click();
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
		await expect(aspect).toHaveValue("1.5");
		await aspect.selectOption({ label: "Square" });
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
		await setFrame();
	});

	await test.step("export retains edits and original dimensions independently of viewport zoom", async () => {
		await page.evaluate(() => {
			window.openlight.beginEdit();
			window.openlight.setAdjustments({
				exposure: 1,
				highlights: -20,
				shadows: 30,
				whites: 10,
				blacks: -5,
				clarity: -50,
			});
			window.openlight.setToneCurve([
				{ x: 0, y: 0 },
				{ x: 0.5, y: 0.75 },
				{ x: 1, y: 1 },
			]);
			window.openlight.commitEdit();
		});
		const expected = await readImage(page);
		expect(expected.center[0]).toBeGreaterThan(190);
		expect(expected.center[0]).toBeLessThan(255);
		expect(expected.corner[0]).toBeGreaterThan(0);
		expect(expected.corner[3]).toBe(255);
		await canvas.hover();
		await zoom(page, Math.E);
		const trigger = page.getByRole("button", { name: "Export", exact: true });
		const dialog = page.getByRole("dialog", { name: "Export image" });
		const sizes: number[] = [];
		for (const quality of [null, 20, 95]) {
			await trigger.click();
			if (quality !== null) {
				await dialog.getByText("Smaller files", { exact: true }).click();
				const field = dialog.getByRole("textbox", { name: "Quality" });
				await field.fill(String(quality));
				await field.press("Enter");
			}
			const pending = page.waitForEvent("download");
			await dialog.getByRole("button", { name: "Save image" }).click();
			const download = await pending;
			expect(download.suggestedFilename()).toBe(
				quality === null ? "export.png" : "export.jpg",
			);
			const path = await download.path();
			if (!path) throw new Error("Missing image download.");
			const bytes = await readFile(path);
			const actual = await readImage(page, bytes);
			expect(actual.size).toEqual([1200, 800]);
			expect(
				Math.abs(actual.center[0] - expected.center[0]),
			).toBeLessThanOrEqual(3);
			if (quality === null) expect(actual).toEqual(expected);
			else sizes.push(bytes.length);
			await expect(dialog).toBeHidden();
			await expect(trigger).toBeFocused();
		}
		expect(sizes[1]).toBeGreaterThan(sizes[0]);
		await trigger.click();
		await expect(dialog.getByRole("slider", { name: "Quality" })).toHaveValue(
			"95",
		);
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	});

	await test.step("mobile slider targets accept taps above and below the visible track", async () => {
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 },
			isMobile: true,
			hasTouch: true,
			deviceScaleFactor: 2,
		});
		try {
			const mobile = await context.newPage();
			await mobile.goto(page.url());
			await mobile
				.locator('input[type="file"]')
				.setInputFiles("tests/fixtures/photo.svg");
			const exposure = mobile.getByRole("slider", {
				name: "Exposure",
				exact: true,
			});
			await exposure.scrollIntoViewIfNeeded();
			for (const slider of await mobile.getByRole("slider").all()) {
				const bounds = await box(slider);
				expect(bounds.width).toBeGreaterThanOrEqual(44);
				expect(bounds.height).toBeGreaterThanOrEqual(44);
				const track = await box(slider.locator(".."));
				expect(track.height).toBe(4);
				expectCentered(bounds, track);
			}
			const bounds = await box(exposure);
			await mobile.touchscreen.tap(bounds.x + bounds.width - 2, bounds.y + 16);
			await expect(exposure).toHaveValue("5");
			expect((await readImage(mobile)).center).toEqual([255, 255, 255, 255]);
			await mobile.touchscreen.tap(bounds.x + 2, bounds.y + bounds.height - 3);
			await expect(exposure).toHaveValue("-5");
			const undo = mobile.getByRole("button", { name: "Undo", exact: true });
			await undo.tap();
			await expect(exposure).toHaveValue("5");
			await undo.tap();
			await expect(exposure).toHaveValue("0");
			expect((await readImage(mobile)).center).toEqual([128, 128, 128, 255]);
			const field = mobile.getByRole("textbox", {
				name: "Exposure",
				exact: true,
			});
			await field.tap();
			await expect(field).toBeFocused();
		} finally {
			await context.close();
		}
	});
});
