import { expect, test } from "./fixtures";

test("vignette is centered, symmetric and progressive with exact bypass, alpha and HDR preservation", async ({
	page,
}, info) => {
	await page.goto("/tests/gpu.html");
	let maximumError = 0;
	let symmetryError = 0;
	let alphaError = 0;
	let monotonicError = 0;
	const sizes: [number, number][] = [
		[33, 17],
		[17, 33],
		[1, 17],
		[1, 1],
	];
	for (const size of sizes) {
		const { original, outputs } = await page.evaluate(async (size) => {
			const path = "/tests/vignette-gpu.ts";
			const { probeVignette } = (await import(
				path
			)) as typeof import("./vignette-gpu");
			return probeVignette(size);
		}, size);
		const [width, height] = size;
		const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
		for (const { intensity, softness, pixels } of outputs) {
			expect(pixels.every(Number.isFinite)).toBe(true);
			if (intensity === 0) {
				expect(pixels).toEqual(original);
			}
			expect(pixels.slice(center, center + 4)).toEqual([4, 2, 0.5, 0.25]);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const i = (y * width + x) * 4;
					const radius =
						Math.hypot((x + 0.5) / width - 0.5, (y + 0.5) / height - 0.5) *
						Math.SQRT2;
					const start = 0.75 * (1 - softness / 100);
					const t = Math.max(0, Math.min(1, (radius - start) / (1 - start)));
					const gain = 1 - (intensity / 100) * t * t * (3 - 2 * t);
					for (const [channel, input] of [4, 2, 0.5].entries()) {
						maximumError = Math.max(
							maximumError,
							Math.abs(pixels[i + channel] - input * gain),
						);
					}
					alphaError = Math.max(alphaError, Math.abs(pixels[i + 3] - 0.25));
					symmetryError = Math.max(
						symmetryError,
						Math.abs(pixels[i] - pixels[(y * width + width - 1 - x) * 4]),
						Math.abs(pixels[i] - pixels[((height - 1 - y) * width + x) * 4]),
					);
					if (x < Math.floor(width / 2)) {
						monotonicError = Math.max(
							monotonicError,
							pixels[i] - pixels[i + 4],
						);
					}
				}
			}
		}
		for (let i = 0; i < original.length; i += 4) {
			monotonicError = Math.max(
				monotonicError,
				outputs[5].pixels[i] - outputs[3].pixels[i],
				outputs[8].pixels[i] - outputs[5].pixels[i],
			);
		}
	}
	expect(maximumError).toBeLessThan(0.004);
	expect(symmetryError).toBe(0);
	expect(alphaError).toBe(0);
	expect(monotonicError).toBe(0);
	console.log(
		JSON.stringify({ maximumError, symmetryError, alphaError, monotonicError }),
	);
	await info.attach("linear-rgb-error", {
		body: JSON.stringify({
			maximumError,
			limit: 0.004,
			units: "linear Rec.2020 channel value",
		}),
		contentType: "application/json",
	});
});
