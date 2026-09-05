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
	await test.step("failed layer imports preserve content and panel drops add to the document", async () => {
		const before = await page.evaluate(() => window.openlight.getState());
		const failed = await page.evaluate(async () => {
			try {
				await window.openlight.addImageLayer(
					new File(["broken"], "broken.png", { type: "image/png" }),
				);
			} catch {
				return true;
			}
			return false;
		});
		expect(failed).toBe(true);
		expect(await page.evaluate(() => window.openlight.getState())).toEqual(
			before,
		);
		const transfer = await page.evaluateHandle(
			(text) => {
				const data = new DataTransfer();
				data.items.add(
					new File([text], "dropped.svg", { type: "image/svg+xml" }),
				);
				return data;
			},
			await readFile("tests/fixtures/overlay.svg", "utf8"),
		);
		await page
			.getByRole("region", { name: "Layers", exact: true })
			.dispatchEvent("drop", { dataTransfer: transfer });
		await expect(
			page.getByRole("button", { name: "Select dropped.svg", exact: true }),
		).toBeVisible();
		const after = await page.evaluate(() => window.openlight.getState());
		expect(after.documentId).toBe(before.documentId);
		expect(after.layers).toHaveLength(2);
		await transfer.dispose();
	});
});
