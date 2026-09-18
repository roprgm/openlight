import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";
import { box, drag } from "./pointer";

async function samples(page: Page) {
	return page.evaluate(async () => {
		const image = await createImageBitmap(await window.openlight.exportImage());
		const canvas = new OffscreenCanvas(image.width, image.height);
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Cannot read layer output.");
		}
		context.drawImage(image, 0, 0);
		image.close();
		return [100, 700].map((y) => [...context.getImageData(600, y, 1, 1).data]);
	});
}

test("draw a mask, edit its child effects, reorder layers and undo", async ({
	page,
}, info) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	const state = () => page.evaluate(() => window.openlight.getState());
	async function setField(name: string, value: string) {
		const field = page.getByRole("textbox", { name, exact: true });
		await field.fill(value);
		await field.press("Enter");
	}
	async function action(name: string, command: string) {
		await page
			.getByRole("button", { name: `${name} actions`, exact: true })
			.click();
		await page
			.locator("[popover]:popover-open")
			.getByRole("button", { name: command, exact: true })
			.click();
	}
	async function dragLayer(name: string, target: string, fraction: number) {
		const from = await box(
			page
				.getByRole("region", { name: "Layers", exact: true })
				.getByRole("button", { name, exact: true }),
		);
		const row = page
			.locator("[data-selected]")
			.filter({ has: page.getByRole("button", { name: target, exact: true }) });
		const to = await box(row);
		await drag(
			page,
			[from.x + from.width / 2, from.y + from.height / 2],
			[to.x + to.width / 2, to.y + to.height * fraction],
		);
	}
	async function saveExport(name: string) {
		const bytes = await page.evaluate(async () => [
			...new Uint8Array(
				await (await window.openlight.exportImage()).arrayBuffer(),
			),
		]);
		await writeFile(info.outputPath(name), new Uint8Array(bytes));
	}
	await page.goto("/");
	await page
		.locator('input[type="file"]')
		.setInputFiles("tests/fixtures/photo.svg");
	await expect(
		page.getByRole("textbox", { name: "Exposure", exact: true }),
	).toHaveValue("0.00");
	await test.step("Details is an optional effect, separate from image adjustments", async () => {
		await expect(
			page.getByRole("button", { name: "Adjustments", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("textbox", { name: "Clarity", exact: true }),
		).toHaveCount(0);
		await page.getByRole("button", { name: "Add effect", exact: true }).click();
		await page
			.locator("[popover]:popover-open")
			.getByRole("button", { name: "Details", exact: true })
			.click();
		await setField("Clarity", "-100");
		expect((await readImage(page)).corner[0]).toBeGreaterThan(0);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect((await readImage(page)).corner).toEqual([0, 0, 0, 255]);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
	});
	const original = await samples(page);
	await page.screenshot({ path: info.outputPath("layers-before-ui.png") });
	await saveExport("layers-before-export.png");
	await page
		.getByRole("button", { name: "Add linear mask", exact: true })
		.click();
	const overlay = page.getByLabel("Gradient mask canvas", { exact: true });
	const bounds = await box(overlay);
	const scale = Math.min(bounds.width / 1200, bounds.height / 800, 2);
	const center = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
	const from = [center[0], center[1] - 200 * scale];
	const to = [center[0], center[1] + 200 * scale];
	await test.step("cancellation is empty; drawing creates a mask with its own adjustments", async () => {
		await page.mouse.move(from[0], from[1]);
		await page.mouse.down();
		await page.mouse.move(to[0], to[1]);
		await page.keyboard.press("Escape");
		await page.mouse.up();
		expect((await state()).scene?.layers).toHaveLength(1);
		await page.keyboard.press("l");
		await drag(page, from, to);
		const layers = (await state()).scene?.layers;
		expect(layers).toHaveLength(2);
		expect(layers?.[1]).toMatchObject({
			kind: "mask",
			children: [],
		});
		await setField("Exposure", "1");
		const [top, bottom] = await samples(page);
		expect(top[0]).toBeGreaterThan(170);
		expect(bottom).toEqual([128, 128, 128, 255]);
		await setField("Temp", "20");
		const warmed = await samples(page);
		expect(warmed[0][0]).toBeGreaterThan(warmed[0][2]);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect(await samples(page)).toEqual([top, bottom]);
		await setField("Exposure", "2");
		expect((await samples(page))[0][0]).toBeGreaterThan(top[0] + 20);
	});
	await test.step("selected gradient guides move, resize and rotate with atomic undo and cancellation", async () => {
		const before = await state();
		const pixels = await samples(page);
		await drag(page, center, [center[0], center[1] - 150 * scale]);
		expect((await state()).history.undoCount).toBe(
			before.history.undoCount + 1,
		);
		expect(await samples(page)).not.toEqual(pixels);
		await page.keyboard.press("ControlOrMeta+z");
		expect((await state()).scene).toEqual(before.scene);
		expect(await samples(page)).toEqual(pixels);
		await drag(page, from, [from[0], from[1] - 50 * scale]);
		expect((await state()).scene).not.toEqual(before.scene);
		await page.keyboard.press("ControlOrMeta+z");
		await drag(page, [center[0] + 80, center[1]], [center[0], center[1] + 80]);
		const rotated = (await state()).scene?.layers[1];
		expect(rotated?.kind).toBe("mask");
		if (rotated?.kind === "mask" && rotated.mask.kind === "linear") {
			expect(
				Math.abs(rotated.mask.end[1] - rotated.mask.start[1]),
			).toBeLessThan(1);
		}
		await page.keyboard.press("ControlOrMeta+z");
		await page.mouse.move(center[0], center[1]);
		await page.mouse.down();
		await page.mouse.move(center[0] + 50, center[1] + 50);
		await page.keyboard.press("Escape");
		await page.mouse.up();
		expect((await state()).scene).toEqual(before.scene);
		await page.keyboard.press("Delete");
		expect((await state()).scene?.layers).toHaveLength(1);
		await page.keyboard.press("ControlOrMeta+z");
		expect((await state()).scene).toEqual(before.scene);
	});
	await test.step("mask opacity and visibility apply to the complete branch", async () => {
		await page
			.getByRole("button", { name: "Linear Gradient", exact: true })
			.dblclick();
		await setField("Layer name", "Sky");
		const masked = await samples(page);
		await setField("Opacity", "0");
		expect(await samples(page)).toEqual(original);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect(await samples(page)).toEqual(masked);
		await page.getByRole("button", { name: "Show Sky", exact: true }).click();
		expect(await samples(page)).toEqual(original);
		await page.getByRole("button", { name: "Show Sky", exact: true }).click();
		expect(await samples(page)).toEqual(masked);
	});
	await test.step("a subtracting child changes coverage and Add restores the masked region", async () => {
		const masked = await samples(page);
		await page
			.getByRole("button", { name: "Subtract from mask", exact: true })
			.click();
		await page
			.locator("[popover]:popover-open")
			.getByRole("button", { name: "Linear gradient", exact: true })
			.click();
		await drag(page, from, to);
		expect((await samples(page))[0]).toEqual(original[0]);
		const operation = page.getByRole("combobox", {
			name: "Mask operation",
			exact: true,
		});
		await operation.selectOption("add");
		expect((await samples(page))[0]).toEqual(masked[0]);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect((await samples(page))[0]).toEqual(original[0]);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect(await samples(page)).toEqual(masked);
		await page.getByRole("button", { name: "Sky", exact: true }).click();
	});

	await test.step("child effects can leave the mask, reorder and return through undo", async () => {
		const masked = await samples(page);
		await page.getByRole("button", { name: "Add effect", exact: true }).click();
		await page.keyboard.press("Escape");
		await expect(page.locator("[popover]:popover-open")).toHaveCount(0);
		await page.getByRole("button", { name: "Add effect", exact: true }).click();
		await page
			.locator("[popover]:popover-open")
			.getByRole("button", { name: "Vignette", exact: true })
			.click();
		expect(
			(await state()).scene?.layers[1].children.map((layer) => layer.kind),
		).toEqual(["vignette"]);
		await setField("Intensity", "80");
		const nested = await samples(page);
		expect(nested[0][0]).toBeLessThan(masked[0][0]);
		expect(nested[1]).toEqual(masked[1]);
		const beforeMove = (await state()).history.undoCount;
		await dragLayer("Vignette", "Sky", 0.1);
		expect((await state()).history.undoCount).toBe(beforeMove + 1);
		expect((await state()).scene?.layers).toHaveLength(3);
		expect((await samples(page))[1][0]).toBeLessThan(masked[1][0]);
		await dragLayer("Vignette", "photo.svg", 0.1);
		expect((await state()).scene?.layers[1].kind).toBe("vignette");
		await dragLayer("Vignette", "Sky", 0.5);
		expect(await samples(page)).toEqual(nested);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect(await samples(page)).toEqual(nested);
		await action("Vignette", "Delete");
		expect(await samples(page)).toEqual(masked);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		expect((await state()).scene?.layers[1].children).toHaveLength(1);
	});
	await page.getByRole("button", { name: "Sky", exact: true }).click();
	await page.screenshot({ path: info.outputPath("layers-after-ui.png") });
	await saveExport("layers-after-export.png");
	await test.step("radial masks edit locally, resize, feather, rotate, subtract and undo", async () => {
		const before = await readImage(page);
		const beforeSamples = await samples(page);
		await page.keyboard.press("r");
		await drag(page, center, [
			center[0] + 220 * scale,
			center[1] + 120 * scale,
		]);
		await setField("Exposure", "1");
		expect((await readImage(page)).center[0]).toBeGreaterThan(
			before.center[0] + 20,
		);
		expect((await samples(page))[1]).toEqual(beforeSamples[1]);
		await page.screenshot({ path: info.outputPath("radial-ui.png") });
		await saveExport("radial-export.png");
		const edited = await state();
		await drag(page, center, [center[0] + 300 * scale, center[1]]);
		expect((await state()).history.undoCount).toBe(
			edited.history.undoCount + 1,
		);
		expect((await readImage(page)).center).toEqual(before.center);
		await page.keyboard.press("ControlOrMeta+z");
		expect((await state()).scene).toEqual(edited.scene);
		const radius = await box(
			page.getByLabel("Radial right radius", { exact: true }),
		);
		await drag(
			page,
			[radius.x + radius.width / 2, radius.y + radius.height / 2],
			[radius.x + radius.width / 2 - 60, radius.y + radius.height / 2],
		);
		expect((await state()).scene).not.toEqual(edited.scene);
		await page.keyboard.press("ControlOrMeta+z");
		await setField("Feather", "80");
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		await expect(
			page.getByRole("textbox", { name: "Feather", exact: true }),
		).toHaveValue("50");
		const rotation = await box(
			page.getByLabel("Rotate radial gradient", { exact: true }),
		);
		await drag(
			page,
			[rotation.x + rotation.width / 2, rotation.y + rotation.height / 2],
			[center[0] + 150 * scale, center[1]],
		);
		const rotated = (await state()).scene?.layers.at(-1);
		expect(
			rotated?.kind === "mask" &&
				rotated.mask.kind === "radial" &&
				Math.abs(rotated.mask.angle - 90) < 1,
		).toBe(true);
		await page.keyboard.press("ControlOrMeta+z");
		await page
			.getByRole("button", { name: "Subtract from mask", exact: true })
			.click();
		await page
			.locator("[popover]:popover-open")
			.getByRole("button", { name: "Radial gradient", exact: true })
			.click();
		await drag(page, center, [
			center[0] + 220 * scale,
			center[1] + 120 * scale,
		]);
		expect((await readImage(page)).center).toEqual(before.center);
		await page.keyboard.press("Delete");
		expect((await readImage(page)).center[0]).toBeGreaterThan(
			before.center[0] + 20,
		);
		await page.keyboard.press("ControlOrMeta+z");
		expect((await readImage(page)).center).toEqual(before.center);
	});
});
