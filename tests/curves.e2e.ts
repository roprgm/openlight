import { expect, type Page, test } from "@playwright/test";
import { interpolateCurve } from "@/lib/curves";

async function centerPixel(page: Page) {
	const screenshot = await page.locator("canvas").screenshot();
	return page.evaluate(
		async (bytes) => {
			const image = await createImageBitmap(
				new Blob([new Uint8Array(bytes)], { type: "image/png" }),
			);
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext("2d");
			if (!context) {
				throw new Error("Cannot read the preview screenshot.");
			}
			context.drawImage(image, 0, 0);
			image.close();
			return [
				...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
			];
		},
		[...screenshot],
	);
}

test("a master curve maps colors beyond its white endpoint to white", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	await page.evaluate(() =>
		window.openlight.loadImage(
			new File(
				[
					'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#305080"/></svg>',
				],
				"blue.svg",
				{ type: "image/svg+xml" },
			),
		),
	);
	await expect.poll(() => centerPixel(page)).toEqual([48, 80, 128, 255]);
	await page.evaluate(() =>
		window.openlight.setCurve([
			{ x: 0, y: 0 },
			{ x: 0.1, y: 1 },
		]),
	);
	await expect.poll(() => centerPixel(page)).toEqual([255, 255, 255, 255]);
});

test("curve commands update the scene, reset, and start fresh for another image", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const result = await page.evaluate(async () => {
		const image = new File(
			[
				'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#808080"/></svg>',
			],
			"curve.svg",
			{ type: "image/svg+xml" },
		);
		await window.openlight.loadImage(image);
		const initial = window.openlight.getState().curve;
		const points = [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.75 },
			{ x: 1, y: 1 },
		];
		window.openlight.setCurve(points);
		points[1].y = 0.25;
		const edited = window.openlight.getState().curve;
		const snapshot = window.openlight.getState();
		snapshot.curve[1].y = 0;
		const afterSnapshotChange = window.openlight.getState().curve;
		window.openlight.setCurve();
		const reset = window.openlight.getState().curve;
		window.openlight.setCurve(edited);
		await window.openlight.loadImage(
			new File(
				[
					'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#305080"/></svg>',
				],
				"another.svg",
				{ type: "image/svg+xml" },
			),
		);
		return {
			initial,
			edited,
			afterSnapshotChange,
			reset,
			reloaded: window.openlight.getState().curve,
			file: window.openlight.getState().file,
		};
	});
	const identity = [
		{ x: 0, y: 0 },
		{ x: 1, y: 1 },
	];
	expect(result.initial).toEqual(identity);
	expect(result.edited).toEqual([
		{ x: 0, y: 0 },
		{ x: 0.5, y: 0.75 },
		{ x: 1, y: 1 },
	]);
	expect(result.afterSnapshotChange).toEqual(result.edited);
	expect(result.reset).toEqual(identity);
	expect(result.reloaded).toEqual(identity);
	expect(result.file).toBe("another.svg");
	await expect.poll(() => centerPixel(page)).toEqual([48, 80, 128, 255]);
});

test("curves render after adjustments and resetting restores the preview", async ({
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
	await expect.poll(() => centerPixel(page)).toEqual([128, 128, 128, 255]);
	const original = await page.locator("canvas").screenshot();
	const points = [
		{ x: 0, y: 0 },
		{ x: 0.5, y: 0.75 },
		{ x: 1, y: 1 },
	];
	await page.evaluate((curve) => window.openlight.setCurve(curve), points);
	await expect
		.poll(async () => (await centerPixel(page))[0])
		.toBeCloseTo(192, -1);
	await page.evaluate(() => window.openlight.setCurve());
	await expect
		.poll(() => page.locator("canvas").screenshot())
		.toEqual(original);
	await page.evaluate(() => window.openlight.setAdjustments({ exposure: -1 }));
	await expect.poll(async () => (await centerPixel(page))[0]).toBeLessThan(120);
	const adjusted = await centerPixel(page);
	const adjustedPreview = await page.locator("canvas").screenshot();
	await page.evaluate((curve) => window.openlight.setCurve(curve), points);
	const expected = interpolateCurve(points)(adjusted[0] / 255) * 255;
	await expect
		.poll(async () => Math.abs((await centerPixel(page))[0] - expected))
		.toBeLessThan(2);
	await page.evaluate(() => window.openlight.setCurve());
	await expect
		.poll(() => page.locator("canvas").screenshot())
		.toEqual(adjustedPreview);
	await page.evaluate(() => window.openlight.setAdjustments({ exposure: 0 }));
	await expect
		.poll(() => page.locator("canvas").screenshot())
		.toEqual(original);
	expect(errors).toEqual([]);
});

test("the curve panel edits points over a combined input histogram", async ({
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
	const graph = page.getByRole("application", { name: "Tone curve" });
	await graph.scrollIntoViewIfNeeded();
	const bounds = await graph.boundingBox();
	if (!bounds) {
		throw new Error("Curve graph is not visible.");
	}
	const input = page.locator('svg[aria-label="input histogram"] polyline');
	const output = page
		.locator('svg[aria-label="output histogram"] polyline')
		.first();
	await expect(input).toHaveCount(1);
	await expect(input).toHaveAttribute("points", /,0\.0/);
	await expect(output).toHaveAttribute("points", /,0\.0/);
	const inputBefore = await input.getAttribute("points");
	const outputBefore = await output.getAttribute("points");
	await graph.click({
		position: { x: bounds.width / 2, y: bounds.height / 2 },
	});
	await expect(graph.locator("circle")).toHaveCount(3);
	await page.mouse.move(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 4,
		{ steps: 5 },
	);
	await page.mouse.up();
	const edited = await page.evaluate(
		() => window.openlight.getState().curve[1],
	);
	expect(edited.x).toBeCloseTo(0.5, 2);
	expect(edited.y).toBeCloseTo(0.75, 2);
	await expect(output).not.toHaveAttribute("points", outputBefore ?? "");
	await expect(input).toHaveAttribute("points", inputBefore ?? "");
	await expect
		.poll(async () => (await centerPixel(page))[0])
		.toBeGreaterThan(185);
	await graph.press("Shift+ArrowDown");
	expect(
		(await page.evaluate(() => window.openlight.getState().curve[1])).y,
	).toBeCloseTo(edited.y - 0.01, 5);
	await graph.press("Delete");
	await expect(graph.locator("circle")).toHaveCount(2);
	await expect.poll(() => centerPixel(page)).toEqual([128, 128, 128, 255]);
	await graph.press("Enter");
	await expect(graph.locator("circle")).toHaveCount(3);
	await graph.press("ArrowUp");
	expect(
		(await page.evaluate(() => window.openlight.getState().curve[1])).y,
	).toBeCloseTo(0.501, 5);
	await graph.dblclick({
		position: { x: bounds.width / 2, y: bounds.height * 0.499 },
	});
	await expect(graph.locator("circle")).toHaveCount(2);
	await page.evaluate(() =>
		window.openlight.setCurve([
			{ x: 0, y: 0 },
			{ x: 0.3, y: 0.4 },
			{ x: 0.7, y: 0.6 },
			{ x: 1, y: 1 },
		]),
	);
	await expect(graph.locator("circle")).toHaveCount(4);
	await page.mouse.move(
		bounds.x + bounds.width * 0.3,
		bounds.y + bounds.height * 0.6,
	);
	await page.mouse.down();
	await page.mouse.move(bounds.x + bounds.width + 20, bounds.y - 20, {
		steps: 5,
	});
	await page.mouse.up();
	const constrained = await page.evaluate(
		() => window.openlight.getState().curve,
	);
	expect(constrained[1].x).toBeLessThan(constrained[2].x);
	expect(constrained[1].y).toBe(1);
	await page.mouse.move(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	expect(await page.evaluate(() => window.openlight.getState().curve)).toEqual(
		constrained,
	);
	await page.getByRole("button", { name: "Reset curve" }).click();
	await expect(graph.locator("circle")).toHaveCount(2);
	expect(await page.evaluate(() => window.openlight.getState().curve)).toEqual([
		{ x: 0, y: 0 },
		{ x: 1, y: 1 },
	]);
	await expect.poll(() => centerPixel(page)).toEqual([128, 128, 128, 255]);
	await page.evaluate(() => window.openlight.setAdjustments({ exposure: -1 }));
	await expect(input).not.toHaveAttribute("points", inputBefore ?? "");
	expect(errors).toEqual([]);
});

test("endpoints follow the edges, remap black and white, and reset on double-click", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	for (const example of [
		{
			color: "#000000",
			index: 0,
			start: { x: 0, y: 0 },
			vertical: { x: 0, y: 0.25 },
			horizontal: { x: 0.2, y: 0 },
			expected: 64,
		},
		{
			color: "#ffffff",
			index: 1,
			start: { x: 1, y: 1 },
			vertical: { x: 1, y: 0.75 },
			horizontal: { x: 0.8, y: 1 },
			expected: 191,
		},
	]) {
		await page.evaluate(
			(color) =>
				window.openlight.loadImage(
					new File(
						[
							`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${color}"/></svg>`,
						],
						"endpoint.svg",
						{ type: "image/svg+xml" },
					),
				),
			example.color,
		);
		const graph = page.getByRole("application", { name: "Tone curve" });
		await graph.evaluate((element) =>
			element.scrollIntoView({ block: "center" }),
		);
		const bounds = await graph.boundingBox();
		if (!bounds) {
			throw new Error("Curve graph is not visible.");
		}
		const screen = (point: { x: number; y: number }) => ({
			x: bounds.x + point.x * bounds.width,
			y: bounds.y + (1 - point.y) * bounds.height,
		});
		const start = screen(example.start);
		const vertical = screen(example.vertical);
		const horizontal = screen(example.horizontal);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(vertical.x, vertical.y, { steps: 5 });
		await page.mouse.up();
		const moved = await page.evaluate(
			(index) => window.openlight.getState().curve[index],
			example.index,
		);
		expect(moved.x).toBeCloseTo(example.vertical.x, 2);
		expect(moved.y).toBeCloseTo(example.vertical.y, 2);
		await expect
			.poll(async () =>
				Math.max(
					...(await centerPixel(page))
						.slice(0, 3)
						.map((value) => Math.abs(value - example.expected)),
				),
			)
			.toBeLessThan(2);
		await graph.dblclick({
			position: {
				x: example.vertical.x * bounds.width,
				y: (1 - example.vertical.y) * bounds.height,
			},
		});
		await expect(graph.locator("circle")).toHaveCount(2);
		expect(
			await page.evaluate(
				(index) => window.openlight.getState().curve[index],
				example.index,
			),
		).toEqual(example.start);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(horizontal.x, horizontal.y, { steps: 5 });
		await page.mouse.up();
		const shifted = await page.evaluate(
			(index) => window.openlight.getState().curve[index],
			example.index,
		);
		expect(shifted.x).toBeCloseTo(example.horizontal.x, 2);
		expect(shifted.y).toBeCloseTo(example.horizontal.y, 2);
		await graph.dblclick({
			position: {
				x: example.horizontal.x * bounds.width,
				y: (1 - example.horizontal.y) * bounds.height,
			},
		});
		expect(
			await page.evaluate(() => window.openlight.getState().curve),
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
		]);
	}
});
