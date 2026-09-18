import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
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
		await action("Vignette", "Move out");
		expect((await state()).scene?.layers).toHaveLength(3);
		expect((await samples(page))[1][0]).toBeLessThan(masked[1][0]);
		await action("Vignette", "Move down");
		expect((await state()).scene?.layers[1].kind).toBe("vignette");
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
});
