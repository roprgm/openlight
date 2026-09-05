import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { readImage } from "./images";

type InputFile = { name: string; content: string; type?: string };

function image(name = "photo.svg"): InputFile {
	return {
		name,
		type: "image/svg+xml",
		content:
			'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#808080"/></svg>',
	};
}

function settings(attributes: string, name = "photo.xmp"): InputFile {
	return {
		name,
		content: `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" ${attributes} /></rdf:RDF>`,
	};
}

async function openFiles(page: Page, files: InputFile[]) {
	return page.evaluate(async (files) => {
		await window.openlight.openFiles(
			files.map(
				({ name, content, type }) => new File([content], name, { type }),
			),
		);
		return window.openlight.getState();
	}, files);
}

test("open image and XMP batches, recover from failures, and replace a document during export", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const unrelated = { name: "notes.txt", content: "Not an image" };
	const empty = await openFiles(page, [
		unrelated,
		settings('crs:Exposure2012="2"'),
	]);
	expect(empty.file).toBeUndefined();
	await expect(page.getByRole("button", { name: "Open image" })).toBeVisible();

	for (const settingsFirst of [true, false]) {
		const parameters = settings(
			'crs:Exposure2012="1.25" crs:Contrast2012="-20" crs:Highlights2012="-50" crs:Shadows2012="50" crs:Whites2012="25" crs:Blacks2012="-25" crs:Vibrance="30" crs:Saturation="-10"',
			settingsFirst ? "photo.xml" : "photo.xmp",
		);
		const ignored = { name: "second.png", content: "invalid image" };
		const files = settingsFirst
			? [parameters, image(), ignored]
			: [image(), ignored, parameters];
		const state = await openFiles(page, [unrelated, ...files]);
		expect(state).toMatchObject({
			file: "photo.svg",
			adjustments: {
				exposure: 1.25,
				contrast: -20,
				highlights: -50,
				shadows: 50,
				whites: 25,
				blacks: -25,
				vibrance: 30,
				saturation: -10,
			},
		});
		await expect(
			page.getByRole("textbox", { name: "Exposure", exact: true }),
		).toHaveValue("1.25");
		const before = await page.locator("canvas").screenshot();
		const partial = await openFiles(page, [
			settings('crs:Exposure2012="3"'),
			settings('crs:Exposure2012="-1"'),
		]);
		expect(partial.adjustments).toMatchObject({
			exposure: -1,
			contrast: -20,
			highlights: -50,
			shadows: 50,
			whites: 25,
			blacks: -25,
			vibrance: 30,
			saturation: -10,
		});
		await expect
			.poll(() => page.locator("canvas").screenshot())
			.not.toEqual(before);
		const reset = await openFiles(page, [
			settings(
				'crs:Highlights2012="0" crs:Shadows2012="0" crs:Whites2012="0" crs:Blacks2012="0"',
			),
		]);
		expect(reset.adjustments).toMatchObject({
			highlights: 0,
			shadows: 0,
			whites: 0,
			blacks: 0,
		});
	}
	const state = await page.evaluate(
		async (batches) => {
			await Promise.all(
				batches.map((files) =>
					window.openlight.openFiles(
						files.map(
							({ name, content, type }) => new File([content], name, { type }),
						),
					),
				),
			);
			return window.openlight.getState();
		},
		[
			[settings('crs:Exposure2012="4"'), image("first.svg")],
			[image("second.svg"), settings('crs:Contrast2012="20"')],
		],
	);
	expect(state).toMatchObject({
		file: "second.svg",
		adjustments: { exposure: 0, contrast: 20 },
	});
	const failed = await openFiles(page, [
		settings('crs:Exposure2012="3"'),
		{ name: "broken.png", content: "invalid image" },
	]);
	expect(failed).toMatchObject({
		file: "broken.png",
		adjustments: { exposure: 0, contrast: 0 },
	});
	await expect(
		page.getByText("Couldn't open broken.png:", { exact: false }),
	).toBeVisible();
	const recovered = await openFiles(page, [
		settings('crs:Exposure2012="-1"'),
		image(),
	]);
	expect(recovered).toMatchObject({
		file: "photo.svg",
		adjustments: { exposure: -1, contrast: 0 },
	});
	await expect(
		page.getByRole("textbox", { name: "Exposure", exact: true }),
	).toHaveValue("-1.00");

	const baseline = await readImage(page);
	const before = await page.evaluate(() => window.openlight.getState());
	await page.evaluate(() => {
		window.openlight.beginEdit();
		window.openlight.setAdjustments({ exposure: 0.5 });
		window.openlight.setAdjustments({ exposure: 1, shadows: 20 });
		window.openlight.setToneCurve([
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.7 },
			{ x: 1, y: 1 },
		]);
		window.openlight.commitEdit();
	});
	const edited = await readImage(page);
	expect(edited).not.toEqual(baseline);
	expect(
		(await page.evaluate(() => window.openlight.getState())).history.undoCount,
	).toBe(before.history.undoCount + 1);
	await page.evaluate(() => window.openlight.undo());
	expect(await readImage(page)).toEqual(baseline);
	await page.evaluate(() => window.openlight.redo());
	expect(await readImage(page)).toEqual(edited);
	await page.evaluate(() => {
		window.openlight.setAdjustments({ exposure: 1 });
		window.openlight.beginEdit();
		window.openlight.setAdjustments({ exposure: -1 });
		window.openlight.cancelEdit();
	});
	expect(await readImage(page)).toEqual(edited);
	expect(
		(await page.evaluate(() => window.openlight.getState())).history.undoCount,
	).toBe(before.history.undoCount + 1);
	await page.evaluate(() => {
		window.openlight.undo();
		window.openlight.beginEdit();
		window.openlight.setAdjustments({ contrast: 20 });
	});
	const imported = await openFiles(page, [
		settings('crs:Highlights2012="-50"'),
	]);
	expect(imported.history).toEqual({
		undoCount: before.history.undoCount + 2,
		redoCount: 0,
	});
	await page.evaluate(() => window.openlight.undo());
	expect(
		(await page.evaluate(() => window.openlight.getState())).adjustments,
	).toMatchObject({ highlights: 0, contrast: 20 });

	const expected = await readImage(page);
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
	expect(replaced.toneCurve).toEqual(before.toneCurve);
});
