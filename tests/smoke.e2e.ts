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
				'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#808080"/></svg>',
			],
			"gray.svg",
			{ type: "image/svg+xml" },
		);
		window.openlight.loadImage(image);
		return window.openlight.getState();
	});
	await expect(page.locator("polyline").first()).toHaveAttribute(
		"points",
		/,0\.0/,
	);
	const canvas = page.locator("canvas");
	const before = await canvas.screenshot();
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
		const superseded = window.openlight.loadImage(
			new File(
				['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>'],
				"superseded.svg",
				{ type: "image/svg+xml" },
			),
		);
		const latest = window.openlight.loadImage(
			new File(["invalid"], "broken.png", { type: "image/png" }),
		);
		await Promise.all([superseded, latest]);
	});
	await expect(
		page.getByText("Couldn't open broken.png:", { exact: false }),
	).toBeVisible();
	const recovered = await page.evaluate(async () => {
		await window.openlight.loadImage(
			new File(
				[
					'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#808080"/></svg>',
				],
				"replacement.svg",
				{ type: "image/svg+xml" },
			),
		);
		return window.openlight.getState();
	});
	expect(recovered.file).toBe("replacement.svg");
	await expect.poll(() => canvas.screenshot()).toEqual(before);
	expect(errors).toEqual([]);
});
