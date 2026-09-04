import { expect, test } from "@playwright/test";

test("loading an image renders the RGB histogram", async ({ page }) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await page.evaluate(() =>
		window.openlight.loadImage(
			new File(
				[
					'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#808080"/></svg>',
				],
				"gray.svg",
				{ type: "image/svg+xml" },
			),
		),
	);
	const histogram = page.getByLabel("output histogram", { exact: true });
	await expect(histogram).toBeVisible();
	const curves = histogram.locator("polygon");
	await expect(curves).toHaveCount(3);
	for (const curve of await curves.all()) {
		await expect(curve).toBeVisible();
	}
});
