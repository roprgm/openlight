import { expect, test } from "@playwright/test";

test("app opens without crashing", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") {
			errors.push(message.text());
		}
	});

	await page.goto("/");
	await expect(page.getByRole("button", { name: "Open image" })).toBeVisible();
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);
	expect(errors, errors.join("\n")).toEqual([]);
});

test("browser actions load, adjust, reset, and report failures", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") {
			errors.push(message.text());
		}
	});
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await page.evaluate(() => {
		const image = new File(
			[
				'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#808080"/><rect width="8" height="32" fill="#202020"/><rect x="24" width="8" height="32" fill="#e0e0e0"/></svg>',
			],
			"gray.svg",
			{ type: "image/svg+xml" },
		);
		window.openlight.openFile(image);
		return window.openlight.getState();
	});
	await expect(page.locator("polyline").first()).toHaveAttribute(
		"points",
		/,0\.0/,
	);
	const canvas = page.locator("canvas");
	const before = await canvas.screenshot();
	const toneControls = [
		{ name: "highlights", label: "Highlights", x: 16, level: 128 },
		{ name: "shadows", label: "Shadows", x: 16, level: 128 },
		{ name: "whites", label: "Whites", x: 28, level: 224 },
		{ name: "blacks", label: "Blacks", x: 4, level: 32 },
	];
	for (const { name, label, x, level } of toneControls) {
		const slider = page.getByRole("slider", { name: label, exact: true });
		const field = page.getByRole("textbox", { name: label, exact: true });
		await expect(slider).toHaveAttribute("min", "-100");
		await expect(slider).toHaveAttribute("max", "100");
		await expect(slider).toHaveValue("0");
		const pixels: number[] = [];
		for (const value of [-100, 100]) {
			await field.fill(String(value));
			await field.press("Enter");
			await expect(slider).toHaveValue(String(value));
			const state = await page.evaluate(() => window.openlight.getState());
			expect(state.adjustments).toMatchObject({ [name]: value });
			pixels.push(
				await page.evaluate(async (x) => {
					const image = await createImageBitmap(
						await window.openlight.exportImage(),
					);
					const canvas = new OffscreenCanvas(image.width, image.height);
					const context = canvas.getContext("2d");
					if (!context) throw new Error("Cannot read exported image.");
					context.drawImage(image, 0, 0);
					image.close();
					return context.getImageData(x, 16, 1, 1).data[0];
				}, x),
			);
		}
		expect(pixels[0]).toBeLessThan(level);
		expect(pixels[1]).toBeGreaterThan(level);
		await expect.poll(() => canvas.screenshot()).not.toEqual(before);
		await slider.dblclick();
		await expect(field).toHaveValue("0");
		await expect.poll(() => canvas.screenshot()).toEqual(before);
	}
	const histogram = await page
		.locator("polyline")
		.first()
		.getAttribute("points");
	const edited = await page.evaluate(() => {
		window.openlight.setAdjustments({ exposure: -1 });
		window.openlight.setAdjustments({ exposure: 1, saturation: -25 });
		return window.openlight.getState();
	});
	expect(edited.adjustments.exposure).toBe(1);
	await expect(
		page.getByRole("textbox", { name: "Exposure", exact: true }),
	).toHaveValue("1.00");
	await expect(page.locator("polyline").first()).not.toHaveAttribute(
		"points",
		histogram ?? "",
	);
	expect(await canvas.screenshot()).not.toEqual(before);
	expect(
		await page.locator("polyline").first().getAttribute("points"),
	).not.toBe(histogram);
	await page.evaluate(() => {
		window.openlight.setAdjustments({ exposure: 0, saturation: 0 });
	});
	await expect.poll(() => canvas.screenshot()).toEqual(before);
	await page.evaluate(async () => {
		window.openlight.setAdjustments({
			highlights: -50,
			shadows: 50,
			whites: 25,
			blacks: -25,
		});
		const superseded = window.openlight.openFile(
			new File(
				['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>'],
				"superseded.svg",
				{ type: "image/svg+xml" },
			),
		);
		const latest = window.openlight.openFile(
			new File(["invalid"], "broken.png", { type: "image/png" }),
		);
		await Promise.all([superseded, latest]);
	});
	await expect(
		page.getByText("Couldn't open broken.png:", { exact: false }),
	).toBeVisible();
	const recovered = await page.evaluate(async () => {
		await window.openlight.openFile(
			new File(
				[
					'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#808080"/><rect width="8" height="32" fill="#202020"/><rect x="24" width="8" height="32" fill="#e0e0e0"/></svg>',
				],
				"replacement.svg",
				{ type: "image/svg+xml" },
			),
		);
		return window.openlight.getState();
	});
	expect(recovered.file).toBe("replacement.svg");
	expect(recovered.adjustments).toMatchObject({
		highlights: 0,
		shadows: 0,
		whites: 0,
		blacks: 0,
	});
	await expect.poll(() => canvas.screenshot()).toEqual(before);
	expect(errors).toEqual([]);
});
