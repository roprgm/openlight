import { expect, test } from "@playwright/test";

function linear(value: number) {
	const encoded = value / 255;
	return encoded <= 0.04045
		? encoded / 12.92
		: ((encoded + 0.055) / 1.055) ** 2.4;
}

test("highlights preserve ramps, compose with preparation, and reset", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const result = await page.evaluate(async () => {
		// The same bright patch appears on two backgrounds, above a translucent row.
		const width = 1025;
		const height = 513;
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Cannot create highlights fixture.");
		const pixels = context.createImageData(width, height);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const patch = Math.abs(x - 256) < 32 || Math.abs(x - 768) < 32;
				const background = x < 512 ? 64 : 248;
				let value = patch && Math.abs(y - 256) < 32 ? 240 : background;
				if (y < 64) value = Math.round((x * 255) / (width - 1));
				pixels.data.set(
					[value, value, value, y === height - 1 ? 128 : 255],
					(y * width + x) * 4,
				);
			}
		}
		context.putImageData(pixels, 0, 0);
		context.fillStyle = "rgb(200, 230, 200)";
		context.fillRect(0, height - 2, width, 1);
		const file = new File([await canvas.convertToBlob()], "contexts.png", {
			type: "image/png",
		});
		const read = async () => {
			const bitmap = await createImageBitmap(
				await window.openlight.exportImage(),
			);
			context.clearRect(0, 0, width, height);
			context.drawImage(bitmap, 0, 0);
			bitmap.close();
			return [...context.getImageData(0, 0, width, height).data];
		};
		await window.openlight.loadImage(file);
		const neutral = await read();
		window.openlight.setAdjustments({ highlights: -100 });
		const negative = await read();
		window.openlight.setAdjustments({ highlights: -50 });
		const half = await read();
		window.openlight.setAdjustments({ highlights: 100 });
		const positive = await read();
		window.openlight.setAdjustments({ highlights: 0, shadows: 100 });
		const liftedShadows = await read();
		window.openlight.setAdjustments({ shadows: 50 });
		const halfShadows = await read();
		const prepared = {
			highlights: -75,
			shadows: 0,
			exposure: 0.4,
			incrementalTemperature: 20,
			incrementalTint: -12,
		};
		window.openlight.setAdjustments(prepared);
		const changed = await read();
		await window.openlight.loadImage(file);
		window.openlight.setAdjustments(prepared);
		const fresh = await read();
		window.openlight.setAdjustments({
			highlights: 0,
			exposure: 0,
			incrementalTemperature: 0,
			incrementalTint: 0,
		});
		const reset = await read();
		const patchIndices = [226, 738].map((x) => (256 * width + x) * 4);
		return {
			neutral: patchIndices.map((i) => neutral[i]),
			negative: patchIndices.map((i) => negative[i]),
			positive: patchIndices.map((i) => positive[i]),
			shadowRamps: [halfShadows, liftedShadows].map((output) =>
				Array.from({ length: width }, (_, x) => output[(32 * width + x) * 4]),
			),
			reloadMatches: changed.every((value, i) => value === fresh[i]),
			ramps: [neutral, negative, half, positive].map((output) =>
				Array.from({ length: width }, (_, x) => output[(32 * width + x) * 4]),
			),
			resetMatches: reset.every((value, i) => value === neutral[i]),
			alphaMatches: [negative, positive, changed, fresh].every((output) =>
				output.every((value, i) => i % 4 !== 3 || value === neutral[i]),
			),
			neutralColors: [negative, positive].every((output) =>
				output
					.slice(32 * width * 4, 33 * width * 4)
					.every(
						(value, i) =>
							i % 4 === 3 || Math.abs(value - output[i - (i % 4)]) <= 1,
					),
			),
			pastel: [neutral, negative, half].map((output) =>
				output.slice((height - 2) * width * 4, (height - 2) * width * 4 + 3),
			),
		};
	});
	expect(result.neutral).toEqual([240, 240]);
	expect(result.positive[0]).toBe(result.positive[1]);
	for (const value of result.negative) expect(value).toBeLessThan(240);
	for (const value of result.positive) expect(value).toBeGreaterThan(240);
	const [neutral, negative, half, positive] = result.ramps;
	const [halfShadows, liftedShadows] = result.shadowRamps;
	for (const ramp of result.ramps) {
		expect(ramp[0]).toBe(0);
		for (let x = 1; x < ramp.length; x++) {
			expect(ramp[x] - ramp[x - 1]).toBeGreaterThanOrEqual(-1);
			expect(ramp[x] - ramp[x - 1]).toBeLessThanOrEqual(6);
		}
	}
	for (let x = 0; x < neutral.length; x++) {
		expect(liftedShadows[x]).toBeGreaterThanOrEqual(neutral[x]);
		expect(halfShadows[x]).toBeGreaterThanOrEqual(neutral[x]);
		expect(halfShadows[x]).toBeLessThanOrEqual(liftedShadows[x]);
		expect(
			Math.abs(
				linear(halfShadows[x]) -
					(linear(neutral[x]) + linear(liftedShadows[x])) / 2,
			),
		).toBeLessThan(0.01);
	}
	expect(liftedShadows[0]).toBe(0);
	expect(liftedShadows.at(-1)).toBe(255);
	for (let x = 0; x < neutral.length; x++) {
		expect(negative[x]).toBeLessThanOrEqual(half[x]);
		expect(half[x]).toBeLessThanOrEqual(neutral[x]);
		expect(positive[x]).toBeGreaterThanOrEqual(neutral[x]);
		expect(
			Math.abs(
				linear(half[x]) - (linear(neutral[x]) + linear(negative[x])) / 2,
			),
		).toBeLessThan(0.01);
	}
	expect(result.reloadMatches).toBe(true);
	expect(result.resetMatches).toBe(true);
	expect(result.alphaMatches).toBe(true);
	expect(result.neutralColors).toBe(true);
	const [pastel, darkened, halfway] = result.pastel;
	expect(Math.abs(darkened[0] - darkened[2])).toBeLessThanOrEqual(1);
	for (let channel = 0; channel < 3; channel++) {
		expect(darkened[channel]).toBeLessThan(pastel[channel]);
		expect(
			Math.abs(
				linear(halfway[channel]) -
					(linear(pastel[channel]) + linear(darkened[channel])) / 2,
			),
		).toBeLessThan(0.01);
	}
	expect(errors).toEqual([]);
});
