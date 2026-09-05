import { readFile } from "node:fs/promises";
import { interpolatePchip } from "@/lib/math";
import { expect, test } from "./fixtures";
import { readImage, readPreview } from "./images";

test("edit a photo, inspect the preview and histograms, undo changes, and export", async ({
	page,
}) => {
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
	const initial = await page.evaluate(() => window.openlight.getState());
	expect((await readImage(page)).center).toEqual([128, 128, 128, 255]);

	await test.step("zoomed rendering reaches the edges of the editor viewport", async () => {
		const viewport = await page
			.getByRole("region", { name: "Image canvas" })
			.boundingBox();
		if (!viewport) throw new Error("Missing editor viewport.");
		expect(await canvas.boundingBox()).toEqual(viewport);
		await canvas.hover();
		await page.keyboard.down("Control");
		await page.mouse.wheel(0, -Math.log(2) * 100);
		await page.keyboard.up("Control");
		const edge = {
			x: viewport.x + viewport.width / 2,
			y: viewport.y + 4,
			width: 1,
			height: 1,
		};
		await expect
			.poll(
				async () =>
					(await readImage(page, await page.screenshot({ clip: edge }))).center,
			)
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
		expect(
			(await readImage(page, await page.screenshot({ clip: sample }))).center,
		).toEqual([48, 80, 128, 255]);
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
			.poll(
				async () =>
					(
						await readImage(
							page,
							await page.screenshot({ clip: { ...sample, x: sample.x + 101 } }),
						)
					).center,
			)
			.toEqual([48, 80, 128, 255]);
		expect(await page.evaluate(() => window.openlight.getState())).toEqual(
			initial,
		);
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
		expect(
			(await page.evaluate(() => window.openlight.getState())).history
				.undoCount,
		).toBe(1);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		await expect(exposure).toHaveValue("0");
		const bounds = await exposure.boundingBox();
		if (!bounds) throw new Error("Exposure slider is missing.");
		await page.mouse.move(
			bounds.x + bounds.width / 2,
			bounds.y + bounds.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(
			bounds.x + bounds.width * 0.6,
			bounds.y + bounds.height / 2,
			{ steps: 8 },
		);
		await page.mouse.up();
		expect(
			(await page.evaluate(() => window.openlight.getState())).history
				.undoCount,
		).toBe(1);
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
		const history = (await page.evaluate(() => window.openlight.getState()))
			.history;
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
		expect(
			(await page.evaluate(() => window.openlight.getState())).history,
		).toEqual(history);
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
		await page.mouse.move(
			bounds.x + bounds.width / 2,
			bounds.y + bounds.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(
			bounds.x + bounds.width / 2,
			bounds.y + bounds.height / 4,
			{ steps: 8 },
		);
		await page.mouse.up();
		await expect(graph.locator("circle")).toHaveCount(3);
		expect(
			(await page.evaluate(() => window.openlight.getState())).history
				.undoCount,
		).toBe(before + 1);
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
			await page.mouse.move(
				bounds.x + from[0] * bounds.width,
				bounds.y + from[1] * bounds.height,
			);
			await page.mouse.down();
			await page.mouse.move(
				bounds.x + to[0] * bounds.width,
				bounds.y + to[1] * bounds.height,
				{ steps: 5 },
			);
			await page.mouse.up();
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

	await test.step("locked crop corners resize continuously when the drag changes direction", async () => {
		await page.evaluate(() =>
			window.openlight.setGeometry({
				x: 0.25,
				y: 0.25,
				width: 0.5,
				height: 0.5,
			}),
		);
		await page.getByRole("button", { name: "Crop and rotate" }).click();
		const selection = page.getByRole("application", { name: "Crop selection" });
		const corner = page.getByRole("button", {
			name: "Resize crop bottom right",
		});
		const grip = await corner.boundingBox();
		if (!grip) throw new Error("Missing crop handle.");
		const x = grip.x + grip.width / 2;
		const y = grip.y + grip.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x - 30, y + 19, { steps: 6 });
		const before = await selection.boundingBox();
		await page.mouse.move(x - 30, y + 21);
		const after = await selection.boundingBox();
		await page.mouse.up();
		if (!before || !after) throw new Error("Missing crop frame.");
		expect(Math.abs(after.width - before.width)).toBeLessThan(6);
		expect(after.x + after.width / 2).toBeCloseTo(
			before.x + before.width / 2,
			0,
		);
		expect(after.y + after.height / 2).toBeCloseTo(
			before.y + before.height / 2,
			0,
		);
		await page.keyboard.press("Escape");
		await page.evaluate(() => window.openlight.setGeometry());
	});

	await test.step("crop drafts cancel, apply once, rotate and straighten without losing the source", async () => {
		const before = await page.evaluate(() => window.openlight.getState());
		const fullHistogram = await output.getAttribute("points");
		const open = page.getByRole("button", { name: "Crop and rotate" });
		await open.click();
		const panel = page.getByRole("region", { name: "Crop tool" });
		await expect(
			panel.getByRole("combobox", { name: "Aspect ratio" }),
		).toHaveValue("1.5");
		await panel
			.getByRole("combobox", { name: "Aspect ratio" })
			.selectOption({ label: "Square" });
		const selection = page.getByRole("application", { name: "Crop selection" });
		const bounds = await selection.boundingBox();
		if (!bounds) throw new Error("Missing crop selection.");
		const corner = page.getByRole("button", {
			name: "Resize crop bottom right",
		});
		await corner.hover();
		await page.mouse.down();
		await page.mouse.move(
			bounds.x + bounds.width * 0.8,
			bounds.y + bounds.height * 0.8,
			{ steps: 6 },
		);
		await page.mouse.up();
		const draft = await page.evaluate(
			() => window.openlight.getState().preview?.crop?.geometry,
		);
		expect(draft).toBeDefined();
		expect(draft?.width).toBeLessThan(2 / 3);
		expect((draft?.width ?? 0) * 1200).toBeCloseTo(
			(draft?.height ?? 0) * 800,
			4,
		);
		const beforeZoom = await selection.boundingBox();
		if (!beforeZoom) throw new Error("Missing crop frame.");
		expect(beforeZoom.x + beforeZoom.width / 2).toBeCloseTo(
			bounds.x + bounds.width / 2,
			0,
		);
		expect(beforeZoom.y + beforeZoom.height / 2).toBeCloseTo(
			bounds.y + bounds.height / 2,
			0,
		);
		expect(draft?.x).toBeCloseTo(1 / 6, 5);
		expect(draft?.y).toBe(0);
		await corner.hover();
		await page.keyboard.down("Control");
		await page.mouse.wheel(0, -40);
		await page.keyboard.up("Control");
		await expect
			.poll(async () => (await selection.boundingBox())?.width ?? 0)
			.toBeGreaterThan(beforeZoom.width * 1.4);
		const zoomed = await selection.boundingBox();
		const grip = await corner.boundingBox();
		if (!zoomed || !grip || !draft)
			throw new Error("Missing zoomed crop frame.");
		await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
		await page.mouse.down();
		await page.mouse.move(
			grip.x + grip.width / 2 - 20,
			grip.y + grip.height / 2 - 20,
			{ steps: 4 },
		);
		await page.mouse.up();
		const resized = await page.evaluate(
			() => window.openlight.getState().preview?.crop?.geometry,
		);
		expect(resized?.width).toBeCloseTo(
			draft.width - 40 / (zoomed.width / draft.width),
			3,
		);
		const beforePan = await selection.boundingBox();
		if (!beforePan) throw new Error("Missing resized crop frame.");
		expect(beforePan.x + beforePan.width / 2).toBeCloseTo(
			zoomed.x + zoomed.width / 2,
			0,
		);
		expect(beforePan.y + beforePan.height / 2).toBeCloseTo(
			zoomed.y + zoomed.height / 2,
			0,
		);
		await page.mouse.wheel(30, 20);
		await expect
			.poll(async () => (await selection.boundingBox())?.x)
			.not.toBe(beforePan?.x);
		expect(
			(await page.evaluate(() => window.openlight.getState())).preview?.crop
				?.geometry,
		).toEqual(resized);
		await page
			.getByRole("button", { name: "Move crop" })
			.press("Shift+ArrowRight");
		for (const gap of [49, 51]) {
			const frame = await selection.boundingBox();
			if (!frame) throw new Error("Missing crop frame.");
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
			).toContain(gap < 50 ? "grab" : "url(");
			await page.mouse.down();
			await page.mouse.move(
				x,
				y + (frame.width / 2 + gap) * Math.tan(Math.PI / 6),
				{ steps: 8 },
			);
			await page.mouse.up();
			const geometry = (await page.evaluate(() => window.openlight.getState()))
				.preview?.crop?.geometry;
			expect(geometry?.angle).toBeCloseTo(gap < 50 ? 0 : 30, 0);
			await page.mouse.move(x + 20, y);
			expect(
				(await page.evaluate(() => window.openlight.getState())).preview?.crop
					?.geometry,
			).toEqual(geometry);
		}
		expect((await readImage(page)).size).toEqual([1200, 800]);
		await page.keyboard.press("Escape");
		expect(
			(await page.evaluate(() => window.openlight.getState())).geometry,
		).toEqual(before.geometry);
		expect(
			(await page.evaluate(() => window.openlight.getState())).history,
		).toEqual(before.history);
		await open.focus();
		await page.keyboard.press("c");
		await panel
			.getByRole("combobox", { name: "Aspect ratio" })
			.selectOption({ label: "Square" });
		await corner.press("Enter");
		await expect(panel).toBeHidden();
		expect(await readImage(page)).toEqual({
			size: [800, 800],
			center: [128, 128, 128, 255],
			corner: [128, 128, 128, 255],
		});
		await expect(output).not.toHaveAttribute("points", fullHistogram ?? "");
		expect(
			(await page.evaluate(() => window.openlight.getState())).history
				.undoCount,
		).toBe(before.history.undoCount + 1);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect((await readImage(page)).size).toEqual([1200, 800]);
		await page.getByRole("button", { name: "Redo", exact: true }).click();
		expect((await readImage(page)).size).toEqual([800, 800]);
		await open.click();
		await panel.getByRole("button", { name: "Reset", exact: true }).click();
		await panel
			.getByRole("button", { name: "Rotate counterclockwise" })
			.click();
		await page.keyboard.press("Enter");
		expect(await readImage(page)).toEqual({
			size: [800, 1200],
			center: [128, 128, 128, 255],
			corner: [224, 224, 224, 255],
		});
		await open.click();
		await panel.getByRole("button", { name: "Rotate clockwise" }).click();
		await panel.getByRole("button", { name: "Rotate clockwise" }).click();
		await panel.getByRole("button", { name: "Apply crop" }).click();
		expect(await readImage(page)).toEqual({
			size: [800, 1200],
			center: [128, 128, 128, 255],
			corner: [32, 32, 32, 255],
		});
		await open.click();
		await panel.getByRole("button", { name: "Reset", exact: true }).click();
		const angle = panel.getByRole("textbox", {
			name: "Rotation",
			exact: true,
		});
		await angle.fill("30");
		await angle.press("Enter");
		await expect(panel).toBeHidden();
		expect(await readImage(page)).toEqual({
			size: [1200, 800],
			center: [128, 128, 128, 255],
			corner: [32, 32, 32, 255],
		});
		await open.click();
		await panel.getByRole("button", { name: "Reset", exact: true }).click();
		await panel.getByRole("button", { name: "Apply crop" }).click();
		await expect.poll(() => canvas.screenshot()).toEqual(original);
	});

	await test.step("flip controls mirror pixels, preserve framing, and support undo", async () => {
		const open = page.getByRole("button", { name: "Crop and rotate" });
		for (const [axis, value] of [
			["horizontal", 224],
			["vertical", 224],
			["horizontal", 32],
			["vertical", 0],
		] as const) {
			await open.click();
			const selection = page.getByRole("application", {
				name: "Crop selection",
			});
			const bounds = await selection.boundingBox();
			if (!bounds) throw new Error("Missing crop frame.");
			await page.getByRole("button", { name: `Flip ${axis}` }).click();
			expect(await selection.boundingBox()).toEqual(bounds);
			const corner = {
				x: bounds.x + 10,
				y: bounds.y + 10,
				width: 1,
				height: 1,
			};
			await expect
				.poll(
					async () =>
						(await readImage(page, await page.screenshot({ clip: corner })))
							.center,
				)
				.toEqual([value, value, value, 255]);
			await page.getByRole("button", { name: "Apply crop" }).click();
			expect((await readImage(page)).corner).toEqual([
				value,
				value,
				value,
				255,
			]);
			await page.getByRole("button", { name: "Undo", exact: true }).click();
			await page.getByRole("button", { name: "Redo", exact: true }).click();
			expect((await readImage(page)).corner).toEqual([
				value,
				value,
				value,
				255,
			]);
		}
	});

	await test.step("cropping preserves framing, moves the image, and rotates around the crop center", async () => {
		await page.evaluate(() =>
			window.openlight.setGeometry({ x: 0.2, y: 0.1, width: 0.2, height: 0.3 }),
		);
		const viewport = await canvas.boundingBox();
		if (!viewport) throw new Error("Missing canvas.");
		const open = page.getByRole("button", { name: "Crop and rotate" });
		await open.click();
		const selection = page.getByRole("application", { name: "Crop selection" });
		const bounds = await selection.boundingBox();
		if (!bounds) throw new Error("Missing crop selection.");
		// A 240px crop starts at 200%, centered exactly where it was before opening the tool.
		expect(bounds.width).toBeCloseTo(480, 0);
		expect(bounds.height).toBeCloseTo(480, 0);
		expect(bounds.x).toBeCloseTo(viewport.x + (viewport.width - 480) / 2, 0);
		expect(bounds.y).toBeCloseTo(viewport.y + (viewport.height - 480) / 2, 0);
		const sample = {
			x: bounds.x + 40,
			y: bounds.y + bounds.height / 2,
			width: 1,
			height: 1,
		};
		expect(
			(await readImage(page, await page.screenshot({ clip: sample }))).center,
		).toEqual([48, 80, 128, 255]);
		const x = bounds.x + bounds.width / 2;
		const y = bounds.y + bounds.height / 2;
		const beforePan = await page.evaluate(() => window.openlight.getState());
		for (const [startX, startY] of [
			[x, y],
			[bounds.x, bounds.y],
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
			expect(await selection.boundingBox()).toEqual({
				...bounds,
				x: bounds.x + 40,
				y: bounds.y + 20,
			});
			expect(await page.evaluate(() => window.openlight.getState())).toEqual(
				beforePan,
			);
			expect(
				(
					await readImage(
						page,
						await page.screenshot({
							clip: { ...sample, x: sample.x + 40, y: sample.y + 20 },
						}),
					)
				).center,
			).toEqual([48, 80, 128, 255]);
			await page.keyboard.down("Space");
			await page.mouse.down();
			await page.mouse.move(startX, startY, { steps: 4 });
			await page.mouse.up();
			await page.keyboard.up("Space");
		}
		await page.mouse.move(x, y);
		const move = page.getByRole("button", { name: "Move crop" });
		await expect(move).toHaveCSS("cursor", "grab");
		await page.mouse.down();
		await expect(move).toHaveCSS("cursor", "grabbing");
		await page.mouse.move(x + 80, y + 30, { steps: 8 });
		await page.mouse.up();
		expect(await selection.boundingBox()).toEqual(bounds);
		expect(
			(await readImage(page, await page.screenshot({ clip: sample }))).center,
		).toEqual([128, 128, 128, 255]);
		await page.mouse.move(bounds.x + bounds.width + 60, y);
		await page.mouse.down();
		await page.mouse.move(
			bounds.x + bounds.width + 60,
			y + (bounds.width / 2 + 60) * Math.tan(Math.PI / 6),
			{ steps: 8 },
		);
		await page.mouse.up();
		expect(await selection.boundingBox()).toEqual(bounds);
		expect(
			(await page.evaluate(() => window.openlight.getState())).preview?.crop
				?.geometry.angle,
		).toBeCloseTo(30, 0);
		const center = { x, y, width: 1, height: 1 };
		expect(
			(await readImage(page, await page.screenshot({ clip: center }))).center,
		).toEqual([48, 80, 128, 255]);
		await page.keyboard.press("Enter");
		expect((await readImage(page)).center).toEqual([48, 80, 128, 255]);
		await canvas.hover();
		await page.keyboard.down("Control");
		await page.mouse.wheel(0, -Math.log(2.5) * 100);
		await page.keyboard.up("Control");
		await page.mouse.wheel(30, 20);
		const before = (
			await readImage(page, await page.screenshot({ clip: center }))
		).center;
		await open.click();
		const zoomed = await selection.boundingBox();
		if (!zoomed) throw new Error("Missing zoomed selection.");
		expect(zoomed.width).toBeCloseTo(1200, 0);
		expect(zoomed.x).toBeCloseTo(
			viewport.x + (viewport.width - 1200) / 2 - 30,
			0,
		);
		expect(zoomed.y).toBeCloseTo(
			viewport.y + (viewport.height - 1200) / 2 - 20,
			0,
		);
		expect(
			(await readImage(page, await page.screenshot({ clip: center }))).center,
		).toEqual(before);
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 80, y + 30, { steps: 8 });
		await page.mouse.up();
		await page.keyboard.press("Enter");
		await open.click();
		expect(await selection.boundingBox()).toEqual(bounds);
		await page.keyboard.press("Escape");
		await page.evaluate(() => window.openlight.setGeometry());
	});

	await test.step("straightened crops leave empty space outside the source and reset restores geometry and camera", async () => {
		await page.evaluate(() =>
			window.openlight.setGeometry({
				x: 0.25,
				y: 0.25,
				width: 0.5,
				height: 0.5,
				angle: 30,
			}),
		);
		await page.getByRole("button", { name: "Crop and rotate" }).click();
		await page.getByRole("button", { name: "Move crop" }).hover();
		await page.keyboard.down("Control");
		await page.mouse.wheel(0, Math.log(2) * 100);
		await page.keyboard.up("Control");
		const selection = page.getByRole("application", { name: "Crop selection" });
		const bounds = await selection.boundingBox();
		if (!bounds) throw new Error("Missing crop frame.");
		const outside = {
			x: bounds.x - bounds.width * 0.46,
			y: bounds.y - bounds.height * 0.46,
			width: 1,
			height: 1,
		};
		const pixel = async () =>
			(await readImage(page, await page.screenshot({ clip: outside }))).center;
		await expect.poll(pixel).toEqual([9, 9, 9, 255]);
		await page.keyboard.down("Control");
		await page.mouse.wheel(0, Math.log(2) * 100);
		await page.keyboard.up("Control");
		const smaller = await selection.boundingBox();
		if (!smaller) throw new Error("Missing zoomed crop frame.");
		// This source pixel rotates beyond the original right edge of the image.
		const sourceX = 0.955 - 0.5;
		const sourceY = 0.13 - 0.5;
		const rotatedX =
			0.5 + Math.cos(Math.PI / 6) * sourceX - (0.5 * sourceY * 800) / 1200;
		const rotatedY =
			0.5 + (0.5 * sourceX * 1200) / 800 + Math.cos(Math.PI / 6) * sourceY;
		const revealed = {
			x: smaller.x + (rotatedX - 0.25) * smaller.width * 2,
			y: smaller.y + (rotatedY - 0.25) * smaller.height * 2,
			width: 1,
			height: 1,
		};
		await expect
			.poll(
				async () =>
					(await readImage(page, await page.screenshot({ clip: revealed })))
						.center,
			)
			.toEqual([90, 90, 90, 255]);
		const reset = page.getByRole("button", { name: "Reset", exact: true });
		await reset.click();
		await expect.poll(pixel).toEqual([0, 0, 0, 255]);
		const fitted = await selection.boundingBox();
		const viewport = await canvas.boundingBox();
		if (!fitted || !viewport) throw new Error("Missing reset crop frame.");
		const fit = Math.min(
			(viewport.width - 48) / 1200,
			(viewport.height - 48) / 800,
			2,
		);
		expect(fitted.width).toBeCloseTo(1200 * fit, 0);
		expect(fitted.height).toBeCloseTo(800 * fit, 0);
		expect(fitted.x + fitted.width / 2).toBeCloseTo(
			viewport.x + viewport.width / 2,
			0,
		);
		expect(fitted.y + fitted.height / 2).toBeCloseTo(
			viewport.y + viewport.height / 2,
			0,
		);
		await page.getByRole("button", { name: "Rotate clockwise" }).click();
		await page.getByRole("button", { name: "Move crop" }).hover();
		await page.keyboard.down("Control");
		await page.mouse.wheel(0, -80);
		await page.keyboard.up("Control");
		await page.mouse.wheel(60, 40);
		await reset.click();
		expect(await selection.boundingBox()).toEqual(fitted);
		await expect(
			page.getByRole("slider", { name: "Rotation", exact: true }),
		).toHaveValue("0");
		await expect(
			page.getByRole("combobox", { name: "Aspect ratio" }),
		).toHaveValue("1.5");
		const draft = (await page.evaluate(() => window.openlight.getState()))
			.preview?.crop?.geometry;
		expect(draft).toMatchObject({
			x: 0,
			y: 0,
			width: 1,
			height: 1,
			rotation: 0,
			angle: 0,
			scale: 1,
			offsetX: 0,
			offsetY: 0,
		});
		await page
			.getByRole("combobox", { name: "Aspect ratio" })
			.selectOption({ label: "Square" });
		const fixed = await selection.boundingBox();
		const move = page.getByRole("button", { name: "Move crop" });
		for (const direction of [
			"ArrowLeft",
			"ArrowRight",
			"ArrowUp",
			"ArrowDown",
		]) {
			for (let i = 0; i < 20; i++) await move.press(`Shift+${direction}`);
			const actual = await selection.boundingBox();
			if (!actual || !fixed) throw new Error("Missing crop frame.");
			expect(actual.x).toBeCloseTo(fixed.x, 0);
			expect(actual.y).toBeCloseTo(fixed.y, 0);
		}
		await page.keyboard.press("Escape");
		await page.evaluate(() => window.openlight.setGeometry());
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
		expect(expected.corner).toEqual([0, 0, 0, 255]);
		await canvas.hover();
		await page.keyboard.down("Control");
		await page.mouse.wheel(0, -100);
		await page.keyboard.up("Control");
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
});
