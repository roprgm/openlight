import { expect, type Page, test } from "@playwright/test";

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

test("file batches load one image before its settings, regardless of file order", async ({
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
});

test("consecutive batches keep settings with their image and recover from a failed image", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
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
});
