import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("exports full-resolution PNGs with current edits through the API and button", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await page.evaluate(async () => {
		await window.openlight.loadImage(
			new File(
				[
					'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#808080"/><rect width="100" height="100" fill="black"/></svg>',
				],
				"photo.original.svg",
				{ type: "image/svg+xml" },
			),
		);
	});
	const button = page.getByRole("button", { name: "Export", exact: true });
	await expect(button).toBeVisible();
	const original = await page.evaluate(async () => {
		const file = await window.openlight.exportImage();
		const image = await createImageBitmap(file);
		const canvas = new OffscreenCanvas(image.width, image.height);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Cannot read exported image.");
		context.drawImage(image, 0, 0);
		image.close();
		return [...context.getImageData(600, 400, 1, 1).data];
	});
	expect(original).toEqual([128, 128, 128, 255]);
	await page.evaluate(() => {
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
	});
	// The viewport may be zoomed; exporting still includes the original image edges.
	await page.locator("canvas").hover();
	await page.keyboard.down("Control");
	await page.mouse.wheel(0, -100);
	await page.keyboard.up("Control");
	const pending = page.waitForEvent("download");
	await button.click();
	await page.getByRole("button", { name: "Save image" }).click();
	const download = await pending;
	expect(download.suggestedFilename()).toBe("export.png");
	const path = await download.path();
	if (!path) throw new Error("Missing downloaded PNG.");
	const pixels = await page.evaluate(
		async (bytes) => {
			const image = await createImageBitmap(
				new Blob([new Uint8Array(bytes)], { type: "image/png" }),
			);
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Cannot read exported image.");
			context.drawImage(image, 0, 0);
			image.close();
			return {
				size: [canvas.width, canvas.height],
				center: [...context.getImageData(600, 400, 1, 1).data],
				corner: [...context.getImageData(10, 10, 1, 1).data],
			};
		},
		[...(await readFile(path))],
	);
	expect(pixels.size).toEqual([1200, 800]);
	expect(pixels.corner).toEqual([0, 0, 0, 255]);
	// Exposure alone produces about 175; the lifted curve must also be present.
	expect(pixels.center[0]).toBeGreaterThan(190);
	expect(pixels.center[0]).toBeLessThan(255);
	expect(pixels.center[3]).toBe(255);
	await expect(button).toBeEnabled();
	expect(errors).toEqual([]);
});

test("export dialog selects JPEG quality, preserves settings, and dismisses", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await page.evaluate(async () => {
		const canvas = new OffscreenCanvas(256, 256);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Cannot create test image.");
		const pixels = context.createImageData(256, 256);
		for (let i = 0; i < pixels.data.length; i += 4) {
			pixels.data[i] = (i * 31) % 251;
			pixels.data[i + 1] = (i * 17) % 253;
			pixels.data[i + 2] = (i * 7) % 255;
			pixels.data[i + 3] = 255;
		}
		context.putImageData(pixels, 0, 0);
		await window.openlight.loadImage(
			new File([await canvas.convertToBlob()], "texture.png", {
				type: "image/png",
			}),
		);
	});
	const trigger = page.getByRole("button", { name: "Export", exact: true });
	const dialog = page.getByRole("dialog", { name: "Export image" });
	await trigger.click();
	await expect(dialog.getByRole("radio", { name: /png/i })).toBeChecked();
	await expect(dialog.getByRole("slider", { name: "Quality" })).toBeHidden();
	await dialog.getByText("Smaller files", { exact: true }).click();
	const quality = dialog.getByRole("slider", { name: "Quality" });
	await expect(quality).toHaveValue("90");
	const sizes: number[] = [];
	for (const value of [20, 95]) {
		await dialog.getByRole("textbox", { name: "Quality" }).fill(String(value));
		await dialog.getByRole("textbox", { name: "Quality" }).press("Enter");
		const pending = page.waitForEvent("download");
		await dialog.getByRole("button", { name: "Save image" }).click();
		const download = await pending;
		expect(download.suggestedFilename()).toBe("export.jpg");
		const path = await download.path();
		if (!path) throw new Error("Missing JPEG download.");
		const bytes = await readFile(path);
		expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255]);
		sizes.push(bytes.length);
		await expect(dialog).toBeHidden();
		await expect(trigger).toBeFocused();
		await trigger.click();
		await expect(quality).toHaveValue(String(value));
	}
	expect(sizes[1]).toBeGreaterThan(sizes[0]);
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
	await trigger.click();
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toBeHidden();
	const result = await page.evaluate(async () => {
		const file = await window.openlight.exportImage({
			format: "jpeg",
			quality: 80,
		});
		const image = await createImageBitmap(file);
		const size = [image.width, image.height];
		image.close();
		return { name: file.name, type: file.type, size };
	});
	expect(result).toEqual({
		name: "export.jpg",
		type: "image/jpeg",
		size: [256, 256],
	});
});
