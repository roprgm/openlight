import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box, drag } from "./pointer";

async function samples(page: Page, points: number[][]) {
	return page.evaluate(async (points) => {
		const image = await createImageBitmap(await window.openlight.exportImage());
		const canvas = new OffscreenCanvas(image.width, image.height);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Cannot read layer output.");
		context.drawImage(image, 0, 0);
		image.close();
		return points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
	}, points);
}

test("develop an image, draw and edit independent masked layers, then crop and export", async ({
	page,
}, info) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	const state = () => page.evaluate(() => window.openlight.getState());
	const field = (name: string) =>
		page.getByRole("textbox", { name, exact: true });
	async function setField(name: string, value: string) {
		await field(name).fill(value);
		await field(name).press("Enter");
	}
	async function saveExport(name: string) {
		const bytes = new Uint8Array(
			await page.evaluate(async () => [
				...new Uint8Array(
					await (await window.openlight.exportImage()).arrayBuffer(),
				),
			]),
		);
		await writeFile(info.outputPath(name), bytes);
		return bytes;
	}
	await page.goto("/");
	await page
		.locator('input[type="file"]')
		.setInputFiles("tests/fixtures/photo.svg");
	await expect(field("Exposure")).toHaveValue("0.00");
	const original = await readImage(page);
	await page.screenshot({ path: info.outputPath("image-develop-ui.png") });
	await saveExport("image-original-export.png");

	await test.step("image Develop retains exposure and curve editing", async () => {
		await setField("Exposure", "-1");
		const adjusted = await readImage(page);
		expect(adjusted.center[0]).toBeLessThan(original.center[0]);
		const graph = page.getByRole("application", { name: "Tone curve" });
		await graph.scrollIntoViewIfNeeded();
		const bounds = await box(graph);
		await drag(
			page,
			[bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
			[bounds.x + bounds.width / 2, bounds.y + bounds.height / 4],
		);
		expect((await readImage(page)).center[0]).toBeGreaterThan(
			adjusted.center[0],
		);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect(await readImage(page)).toEqual(adjusted);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect(await readImage(page)).toEqual(original);
	});

	await page.getByRole("tab", { name: "Layers", exact: true }).click();
	await page.getByRole("button", { name: "Original Image · Develop" }).click();
	await page.keyboard.press("g");
	const overlay = page.getByLabel("Gradient mask canvas", { exact: true });
	const bounds = await box(overlay);
	const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
	const center = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
	const from = [center[0], center[1] - 200 * scale];
	const to = [center[0], center[1] + 200 * scale];

	await test.step("cancel leaves no layer; drawing creates and selects a gradient effect", async () => {
		await page.mouse.move(from[0], from[1]);
		await page.mouse.down();
		await page.mouse.move(to[0], to[1]);
		await page.keyboard.press("Escape");
		await page.mouse.up();
		expect((await state()).scene?.layers).toHaveLength(0);
		await page.keyboard.press("g");
		await drag(page, from, to);
		const created = await state();
		expect(created.scene?.layers).toHaveLength(1);
		expect(created.selectedLayerId).toBe(created.scene?.layers[0].id);
		const [top, bottom] = await samples(page, [
			[600, 100],
			[600, 700],
		]);
		expect(top[0]).toBeGreaterThan(170);
		expect(bottom).toEqual([128, 128, 128, 255]);
		await setField("Exposure", "2");
		expect((await samples(page, [[600, 100]]))[0][0]).toBeGreaterThan(
			top[0] + 20,
		);
	});

	await page.getByRole("tab", { name: "Layers", exact: true }).click();
	await page.screenshot({ path: info.outputPath("layers-gradient-ui.png") });
	const gradientOutput = await samples(page, [
		[600, 100],
		[600, 700],
	]);
	await saveExport("layers-gradient-export.png");
	const gradient = (await state()).scene?.layers[0];
	if (!gradient) throw new Error("Missing gradient layer.");
	await test.step("duplicates have independent settings and ordered visibility", async () => {
		await setField("Opacity", "0");
		expect(await readImage(page)).toEqual(original);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect(
			await samples(page, [
				[600, 100],
				[600, 700],
			]),
		).toEqual(gradientOutput);
		await page.getByRole("button", { name: "Duplicate", exact: true }).click();
		await setField("Exposure", "-1");
		const layers = (await state()).scene?.layers;
		expect(
			layers?.map((layer) => layer.kind === "exposure" && layer.exposure),
		).toEqual([2, -1]);
		await page
			.getByRole("checkbox", { name: "Show Exposure copy", exact: true })
			.uncheck();
		const alone = await samples(page, [
			[600, 100],
			[600, 700],
		]);
		expect(alone).toEqual(gradientOutput);
		await page
			.getByRole("checkbox", { name: "Show Exposure", exact: true })
			.uncheck();
		expect(await readImage(page)).toEqual(original);
		await page
			.getByRole("checkbox", { name: "Show Exposure", exact: true })
			.check();
		await page.getByRole("button", { name: "Move down", exact: true }).click();
		expect((await state()).scene?.layers[1].id).toBe(gradient.id);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect((await state()).scene?.layers[0].id).toBe(gradient.id);
		await page.getByRole("button", { name: "Delete", exact: true }).click();
		expect((await state()).scene?.layers).toHaveLength(1);
	});

	await test.step("crop keeps the gradient on the document while vignette follows the output frame", async () => {
		const reference = await samples(page, [
			[600, 310],
			[600, 500],
			[600, 690],
		]);
		await page.evaluate(() => {
			const frame = window.openlight.getState().frame;
			if (!frame) throw new Error("Missing document frame.");
			window.openlight.editScene({
				frame: { ...frame, center: [600, 500], size: [400, 400] },
			});
		});
		expect((await state()).scene?.layers[0].mask).toEqual(gradient.mask);
		const cropped = await samples(page, [
			[200, 10],
			[200, 200],
			[200, 390],
		]);
		for (const [index, pixel] of cropped.entries()) {
			expect(Math.abs(pixel[0] - reference[index][0])).toBeLessThanOrEqual(1);
		}
		await page.getByRole("button", { name: "+ Vignette", exact: true }).click();
		await setField("Intensity", "80");
		await setField("Softness", "100");
		const vignette = await samples(page, [
			[200, 10],
			[200, 200],
			[200, 390],
		]);
		expect(vignette[0][0]).toBeLessThan(cropped[0][0] - 20);
		expect(Math.abs(vignette[1][0] - cropped[1][0])).toBeLessThanOrEqual(1);
		expect(vignette[2][0]).toBeLessThan(cropped[2][0] - 20);
		await page.screenshot({ path: info.outputPath("layers-vignette-ui.png") });
		await page
			.getByRole("button", { name: "Exposure Gradient", exact: true })
			.click();
		await page.screenshot({
			path: info.outputPath("layers-cropped-gradient-ui.png"),
		});
		const bytes = await saveExport("layers-cropped-export.png");
		expect((await readImage(page, bytes)).size).toEqual([400, 400]);
	});
});
