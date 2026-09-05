import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

function linear(value: number) {
	const encoded = value / 255;
	return encoded <= 0.04045
		? encoded / 12.92
		: ((encoded + 0.055) / 1.055) ** 2.4;
}

test("tone adjustments preserve ramps, colors and alpha, compose, and reset", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForFunction(() => window.openlight);
	const bytes = await readFile("tests/fixtures/tones.png");
	const result = await page.evaluate(
		async (bytes) => {
			const api = window.openlight;
			const file = new File([new Uint8Array(bytes)], "tones.png", {
				type: "image/png",
			});
			await api.loadImage(file);
			const defaults = api.getState().adjustments;
			const canvas = new OffscreenCanvas(256, 128);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Cannot read tone chart.");
			const read = async () => {
				const image = await createImageBitmap(await api.exportImage());
				context.clearRect(0, 0, 256, 128);
				context.drawImage(image, 0, 0);
				image.close();
				return [...context.getImageData(0, 0, 256, 128).data];
			};
			const neutral = await read();
			const outputs = [];
			for (const change of [
				{},
				{ whites: 100 },
				{ whites: -100 },
				{ blacks: -100 },
				{ blacks: 100 },
				{ whites: 100, blacks: -100 },
				{ whites: -100, blacks: 100 },
				{ highlights: -100 },
				{ highlights: -50 },
				{ highlights: 100 },
				{ shadows: 50 },
				{ shadows: 100 },
			]) {
				api.setAdjustments({ ...defaults, ...change });
				const pixels = await read();
				outputs.push({
					ramp: Array.from({ length: 256 }, (_, x) => pixels[x * 4]),
					pastel: pixels.slice(126 * 256 * 4, 126 * 256 * 4 + 3),
					patches: [64, 192].map((x) => pixels[(96 * 256 + x) * 4]),
					colorEnds: [25, 255].map((x) =>
						pixels.slice((125 * 256 + x) * 4, (125 * 256 + x) * 4 + 3),
					),
					alphaMatches: pixels.every(
						(value, i) => i % 4 !== 3 || value === neutral[i],
					),
					grayMatches: pixels
						.slice(0, 256 * 4)
						.every(
							(value, i) =>
								i % 4 === 3 || Math.abs(value - pixels[i - (i % 4)]) <= 1,
						),
				});
			}
			const prepared = {
				...defaults,
				highlights: -75,
				exposure: 0.4,
				incrementalTemperature: 20,
				incrementalTint: -12,
			};
			api.setAdjustments(prepared);
			const edited = await read();
			await api.loadImage(file);
			api.setAdjustments(prepared);
			const fresh = await read();
			api.setAdjustments(defaults);
			const reset = await read();
			return {
				outputs,
				reloadMatches: edited.every((value, i) => value === fresh[i]),
				resetMatches: neutral.every((value, i) => value === reset[i]),
			};
		},
		[...bytes],
	);
	const [
		original,
		whiteClip,
		whiteLower,
		blackClip,
		blackLift,
		clipped,
		compressed,
		negative,
		half,
		positive,
		halfShadows,
		liftedShadows,
	] = result.outputs;
	for (const output of result.outputs) {
		expect(output.alphaMatches).toBe(true);
		expect(output.grayMatches).toBe(true);
		for (let x = 1; x < 256; x++) {
			expect(output.ramp[x] - output.ramp[x - 1]).toBeGreaterThanOrEqual(-1);
			expect(output.ramp[x] - output.ramp[x - 1]).toBeLessThanOrEqual(6);
		}
	}
	for (const output of result.outputs.slice(0, 7))
		expect(output.ramp[128]).toBe(128);
	for (let x = 0; x < 256; x++) {
		expect(original.ramp[x]).toBe(x);
		if (x <= 127) {
			expect(whiteClip.ramp[x]).toBe(x);
			expect(whiteLower.ramp[x]).toBe(x);
		} else {
			expect(blackClip.ramp[x]).toBe(x);
			expect(blackLift.ramp[x]).toBe(x);
		}
		expect(negative.ramp[x]).toBeLessThanOrEqual(half.ramp[x]);
		expect(half.ramp[x]).toBeLessThanOrEqual(x);
		expect(positive.ramp[x]).toBeGreaterThanOrEqual(x);
		expect(halfShadows.ramp[x]).toBeGreaterThanOrEqual(x);
		expect(halfShadows.ramp[x]).toBeLessThanOrEqual(liftedShadows.ramp[x]);
		for (const [middle, full] of [
			[half, negative],
			[halfShadows, liftedShadows],
		]) {
			expect(
				Math.abs(
					linear(middle.ramp[x]) - (linear(x) + linear(full.ramp[x])) / 2,
				),
			).toBeLessThan(0.01);
		}
	}
	for (const output of [whiteClip, clipped]) {
		expect(output.ramp[230]).toBe(255);
		expect(output.colorEnds[1]).toEqual([255, 255, 255]);
	}
	for (const output of [blackClip, clipped]) {
		expect(output.ramp[25]).toBe(0);
		expect(output.colorEnds[0]).toEqual([0, 0, 0]);
	}
	for (const output of [blackLift, compressed]) {
		expect(output.ramp[0]).toBeGreaterThanOrEqual(25);
		expect(output.ramp[0]).toBeLessThanOrEqual(26);
	}
	for (const output of [whiteLower, compressed]) {
		expect(output.ramp[255]).toBeGreaterThanOrEqual(229);
		expect(output.ramp[255]).toBeLessThanOrEqual(230);
	}
	expect(original.patches).toEqual([240, 240]);
	expect(negative.patches[0]).toBe(negative.patches[1]);
	expect(negative.patches[0]).toBeLessThan(240);
	expect(positive.patches[0]).toBe(positive.patches[1]);
	expect(positive.patches[0]).toBeGreaterThan(240);
	for (const output of [negative, half, positive, liftedShadows])
		expect(output.ramp[0]).toBe(0);
	expect(liftedShadows.ramp[255]).toBe(255);
	expect(Math.abs(negative.pastel[0] - negative.pastel[2])).toBeLessThanOrEqual(
		1,
	);
	for (let channel = 0; channel < 3; channel++) {
		expect(negative.pastel[channel]).toBeLessThan(original.pastel[channel]);
		expect(
			Math.abs(
				linear(half.pastel[channel]) -
					(linear(original.pastel[channel]) +
						linear(negative.pastel[channel])) /
						2,
			),
		).toBeLessThan(0.01);
	}
	expect(result.reloadMatches).toBe(true);
	expect(result.resetMatches).toBe(true);
});
