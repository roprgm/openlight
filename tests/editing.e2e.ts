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

	await test.step("crop drafts cancel, apply once, rotate and straighten without losing the source", async () => {
		const before = await page.evaluate(() => window.openlight.getState());
		const fullHistogram = await output.getAttribute("points");
		const open = page.getByRole("button", { name: "Crop and rotate" });
		await open.click();
		const panel = page.getByRole("region", { name: "Crop tool" });
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
			bounds.y + bounds.height,
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
		await page
			.getByRole("button", { name: "Move crop" })
			.press("Shift+ArrowRight");
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
		await panel.getByRole("button", { name: "Apply crop" }).click();
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
		await panel.getByRole("button", { name: "Uncrop" }).click();
		await panel.getByRole("button", { name: "Rotate 90°" }).click();
		await panel.getByRole("button", { name: "Apply crop" }).click();
		expect(await readImage(page)).toEqual({
			size: [800, 1200],
			center: [128, 128, 128, 255],
			corner: [32, 32, 32, 255],
		});
		await open.click();
		await panel.getByRole("button", { name: "Reset", exact: true }).click();
		const angle = panel.getByRole("textbox", {
			name: "Straighten",
			exact: true,
		});
		await angle.fill("30");
		await angle.press("Enter");
		await expect(panel).toBeVisible();
		await panel.getByRole("button", { name: "Apply crop" }).click();
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
