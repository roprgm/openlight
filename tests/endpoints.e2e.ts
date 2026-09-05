import { expect, test } from "@playwright/test";

test("black and white points preserve midgray, clip or lift endpoints, and reset", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const outputs = await page.evaluate(async () => {
		const canvas = new OffscreenCanvas(256, 2);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Cannot create tone ramp.");
		const pixels = context.createImageData(256, 2);
		for (let x = 0; x < 256; x++) {
			pixels.data.set([x, x, x, 255], x * 4);
			pixels.data.set(
				[x, Math.max(0, x - 10), Math.max(0, x - 20), 255],
				(256 + x) * 4,
			);
		}
		context.putImageData(pixels, 0, 0);
		await window.openlight.loadImage(
			new File([await canvas.convertToBlob()], "ramp.png", {
				type: "image/png",
			}),
		);
		const outputs = [];
		for (const [whites, blacks] of [
			[0, 0],
			[100, 0],
			[-100, 0],
			[0, -100],
			[0, 100],
			[100, -100],
			[-100, 100],
			[0, 0],
		]) {
			window.openlight.setAdjustments({ whites, blacks });
			const image = await createImageBitmap(
				await window.openlight.exportImage(),
			);
			context.drawImage(image, 0, 0);
			image.close();
			outputs.push([...context.getImageData(0, 0, 256, 2).data]);
		}
		return outputs;
	});
	const [
		original,
		whiteClip,
		whiteLower,
		blackClip,
		blackLift,
		clipped,
		compressed,
		reset,
	] = outputs;
	for (const output of outputs) {
		for (let x = 0; x < 256; x++) {
			const [red, green, blue, alpha] = output.slice(x * 4, x * 4 + 4);
			expect(
				Math.max(red, green, blue) - Math.min(red, green, blue),
			).toBeLessThanOrEqual(1);
			expect(alpha).toBe(255);
			if (x > 0) {
				const step = red - output[(x - 1) * 4];
				expect(step).toBeGreaterThanOrEqual(0);
				expect(step).toBeLessThanOrEqual(3);
			}
		}
		expect(output.slice(128 * 4, 128 * 4 + 4)).toEqual([128, 128, 128, 255]);
	}
	for (let x = 0; x < 256; x++) {
		expect(original[x * 4]).toBe(x);
		if (x <= 127) expect(whiteClip[x * 4]).toBe(x);
		if (x <= 127) expect(whiteLower[x * 4]).toBe(x);
		if (x >= 128) expect(blackClip[x * 4]).toBe(x);
		if (x >= 128) expect(blackLift[x * 4]).toBe(x);
	}
	for (const output of [whiteClip, clipped]) {
		expect(output[230 * 4]).toBe(255);
		expect(output.slice((256 + 255) * 4)).toEqual([255, 255, 255, 255]);
	}
	for (const output of [blackClip, clipped]) {
		expect(output[25 * 4]).toBe(0);
		expect(output.slice((256 + 25) * 4, (256 + 26) * 4)).toEqual([
			0, 0, 0, 255,
		]);
	}
	for (const output of [blackLift, compressed]) {
		expect(output[0]).toBeGreaterThanOrEqual(25);
		expect(output[0]).toBeLessThanOrEqual(26);
	}
	for (const output of [whiteLower, compressed]) {
		expect(output[255 * 4]).toBeGreaterThanOrEqual(229);
		expect(output[255 * 4]).toBeLessThanOrEqual(230);
	}
	expect(reset).toEqual(original);
	expect(errors).toEqual([]);
});
