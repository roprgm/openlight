import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

test("decode an image, apply XMP, recover from failure, and replace a document during export", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await page.evaluate(() =>
		window.openlight.loadImage(new File(["invalid"], "broken.png")),
	);
	await expect(
		page.getByText("Couldn't open broken.png:", { exact: false }),
	).toBeVisible();
	await page.evaluate(
		(text) =>
			window.openlight.loadImage(
				new File([text], "photo.svg", { type: "image/svg+xml" }),
			),
		await readFile("tests/fixtures/photo.svg", "utf8"),
	);
	const baseline = await readImage(page);
	expect(baseline.center).toEqual([128, 128, 128, 255]);
	await page.evaluate(() =>
		window.openlight.importXmp(
			new File(
				[
					'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:Exposure2012="-1" /></rdf:RDF>',
				],
				"photo.xmp",
			),
		),
	);
	await expect(
		page.getByRole("textbox", { name: "Exposure", exact: true }),
	).toHaveValue("-1.00");
	const expected = await readImage(page);
	expect(expected.center[0]).toBeLessThan(baseline.center[0]);
	const before = await page.evaluate(() => window.openlight.getState());
	await page.evaluate(() => window.openlight.undo());
	expect(await readImage(page)).toEqual(baseline);
	await page.evaluate(() => window.openlight.redo());
	expect(await readImage(page)).toEqual(expected);
	const exported = await page.evaluate(async () => {
		const api = window.openlight;
		const convert = OffscreenCanvas.prototype.convertToBlob;
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		OffscreenCanvas.prototype.convertToBlob = async function (options) {
			await gate;
			return convert.call(this, options);
		};
		try {
			const pending = api.exportImage();
			await api.loadImage(
				new File(
					['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>'],
					"replacement.svg",
					{ type: "image/svg+xml" },
				),
			);
			release();
			return [...new Uint8Array(await (await pending).arrayBuffer())];
		} finally {
			release();
			OffscreenCanvas.prototype.convertToBlob = convert;
		}
	});
	expect(await readImage(page, new Uint8Array(exported))).toEqual(expected);
	const replaced = await page.evaluate(() => window.openlight.getState());
	expect(replaced.documentId).not.toBe(before.documentId);
	expect(replaced.history).toEqual({ undoCount: 0, redoCount: 0 });
	expect(replaced.adjustments.exposure).toBe(0);
});
