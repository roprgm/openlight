import { expect, test } from "./fixtures";

// Full-resolution Gaussian reference, independent of the shader's reduced blur.
function expectedStep(x: number, left: number, right: number, amount: number) {
	let sum = 0;
	let weights = 0;
	for (let offset = -192; offset <= 192; offset++) {
		const weight = Math.exp(-0.5 * (offset / 64) ** 2);
		sum += (x + offset < 512 ? left : right) * weight;
		weights += weight;
	}
	const original = x < 512 ? left : right;
	return Math.max(
		0,
		Math.min(255, original + (amount / 200) * (original - sum / weights)),
	);
}

test("clarity follows Gaussian local contrast and preserves flat fields and alpha", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const xs = [256, 384, 448, 511, 512, 576, 640, 768];
	const result = await page.evaluate(async (xs) => {
		const api = window.openlight;
		const load = async (width: number, height: number, shapes: string) => {
			await api.loadImage(
				new File(
					[
						`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes}</svg>`,
					],
					"probe.svg",
					{ type: "image/svg+xml" },
				),
			);
		};
		const read = async (positions: number[][]) => {
			const image = await createImageBitmap(await api.exportImage());
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Cannot read clarity probe.");
			context.drawImage(image, 0, 0);
			image.close();
			return positions.map(([x, y]) => [
				...context.getImageData(x, y, 1, 1).data,
			]);
		};
		const steps = [];
		for (const [left, right] of [
			[64, 192],
			[0, 128],
		]) {
			await load(
				1024,
				129,
				[left, right]
					.map(
						(value, i) =>
							`<rect x="${i * 512}" width="512" height="129" fill="rgb(${value},${value},${value})"/>`,
					)
					.join(""),
			);
			for (const amount of [-100, -50, 0, 50, 100]) {
				api.setAdjustments({ clarity: amount });
				steps.push({
					left,
					right,
					amount,
					pixels: await read(xs.map((x) => [x, 64])),
				});
			}
		}
		await load(127, 65, '<rect width="127" height="65" fill="#737373"/>');
		const flat = [];
		for (const clarity of [-100, 0, 100]) {
			api.setAdjustments({ clarity });
			flat.push(
				...(await read([
					[0, 0],
					[63, 32],
					[126, 64],
				])),
			);
		}
		await load(
			127,
			65,
			'<rect width="64" height="65" fill="#737373" fill-opacity="0.5"/>',
		);
		const positions = [
			[10, 32],
			[63, 32],
			[64, 32],
			[126, 64],
		];
		const neutral = await read(positions);
		const alpha = [];
		for (const clarity of [-100, 100]) {
			api.setAdjustments({ clarity });
			alpha.push(await read(positions));
		}
		return { steps, flat, neutral, alpha };
	}, xs);
	for (const { left, right, amount, pixels } of result.steps) {
		for (const [i, pixel] of pixels.entries()) {
			for (const channel of pixel.slice(0, 3))
				expect(
					Math.abs(channel - expectedStep(xs[i], left, right, amount)),
				).toBeLessThanOrEqual(2);
			expect(pixel[3]).toBe(255);
		}
	}
	for (const pixel of result.flat) {
		for (const channel of pixel.slice(0, 3))
			expect(Math.abs(channel - 115)).toBeLessThanOrEqual(1);
		expect(pixel[3]).toBe(255);
	}
	for (const pixels of result.alpha) {
		for (const [i, pixel] of pixels.entries()) {
			expect(pixel[3]).toBe(result.neutral[i][3]);
			for (const [channel, value] of pixel.entries())
				expect(
					Math.abs(value - result.neutral[i][channel]),
				).toBeLessThanOrEqual(2);
		}
	}
});
