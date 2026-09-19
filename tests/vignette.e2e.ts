import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("vignette darkens a white image's edges, softens, undoes and disables", async ({
	page,
}) => {
	await page.goto("/");
	await page.locator('input[type="file"]').setInputFiles({
		name: "white.svg",
		mimeType: "image/svg+xml",
		buffer: Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="white"/></svg>',
		),
	});
	await page.getByRole("button", { name: "Add effect", exact: true }).click();
	await page
		.locator("[popover]:popover-open")
		.getByRole("button", { name: "Vignette", exact: true })
		.click();
	const intensity = page.getByRole("textbox", {
		name: "Intensity",
		exact: true,
	});
	await intensity.fill("0");
	await intensity.press("Enter");
	const exportBytes = () =>
		page.evaluate(async () => [
			...new Uint8Array(
				await (await window.openlight.exportImage()).arrayBuffer(),
			),
		]);
	const original = await exportBytes();

	await intensity.fill("80");
	await intensity.press("Enter");
	const vignetted = await readImage(page);
	expect(vignetted.center).toEqual([255, 255, 255, 255]);
	expect(vignetted.corner[0]).toBeLessThan(255);

	const softness = page.getByRole("textbox", { name: "Softness", exact: true });
	await softness.fill("100");
	await softness.press("Enter");
	const softer = await readImage(page);
	expect(softer.center).toEqual(vignetted.center);
	expect(softer.corner[0]).toBeLessThan(vignetted.corner[0]);

	await page.getByRole("button", { name: "Undo", exact: true }).click();
	expect(await readImage(page)).toEqual(vignetted);

	await intensity.fill("0");
	await intensity.press("Enter");
	expect(await exportBytes()).toEqual(original);
});
