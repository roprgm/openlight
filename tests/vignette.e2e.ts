import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("vignette darkens edges, preserves the center, softens the transition and bypasses zero", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await page.evaluate(() =>
		window.openlight.loadImage(
			new File(
				[
					'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#808080"/></svg>',
				],
				"gray.svg",
				{ type: "image/svg+xml" },
			),
		),
	);
	const exportBytes = () =>
		page.evaluate(async () => [
			...new Uint8Array(
				await (await window.openlight.exportImage()).arrayBuffer(),
			),
		]);
	const original = await exportBytes();
	const gray = [128, 128, 128, 255];
	expect(await readImage(page)).toEqual({
		size: [128, 128],
		center: gray,
		corner: gray,
	});

	await page.evaluate(() =>
		window.openlight.setVignette({ intensity: 80, softness: 0 }),
	);
	const narrow = await readImage(page);
	expect(narrow.center).toEqual(gray);
	expect(narrow.corner[0]).toBeLessThan(128);

	await page.evaluate(() => window.openlight.setVignette({ softness: 100 }));
	const soft = await readImage(page);
	expect(soft.center).toEqual(gray);
	expect(soft.corner[0]).toBeLessThan(narrow.corner[0]);
	expect(soft.corner[0]).toBeGreaterThan(0);

	await page.evaluate(() => window.openlight.setVignette({ intensity: 0 }));
	expect(await exportBytes()).toEqual(original);
});
