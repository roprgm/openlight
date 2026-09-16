import { expect, spyOn, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { fitNoiseModel } from "@/lib/denoise/bayer/noise";
import { createCachedDenoising } from "@/lib/denoise/cache";
import * as noise from "@/lib/denoise/noise";
import { createImageSource } from "@/lib/image-source";

test("preview and export share denoising but keep different white balances alive independently", async () => {
	const gpu = await init();
	// Noiseless statistics bypass the shader: this test checks ownership, not pixels.
	const estimate = spyOn(noise, "estimateNoise").mockResolvedValue(
		Array.from({ length: 16 }, () => [1e-10, 1e-10, 1e-10, 1e-10]),
	);
	const image = target(gpu, { size: [32, 32], format: "rgba16float" });
	const source = createImageSource(image, {
		asShot: { temperature: 5000, tint: 0 },
		createPass() {
			const output = target(gpu, { size: image.size, format: image.format });
			return {
				prepare: async () => {},
				render: () => output,
				dispose: () => output.color.dispose(),
			};
		},
		dispose() {},
	});
	const preview = createCachedDenoising(gpu, source);
	const exported = createCachedDenoising(gpu, source);
	try {
		const balance = { temperature: 2000, tint: 20 };
		await Promise.all([preview.prepare(balance), exported.prepare(balance)]);
		expect(estimate).toHaveBeenCalledTimes(1);
		const captured = exported.texture();
		expect(captured).toBeDefined();
		expect(preview.texture()).toBe(captured);
		await preview.prepare({ temperature: 6000, tint: 0 });
		expect(preview.texture()).not.toBe(captured);
		expect(() => captured?.color.view).not.toThrow();
		exported.dispose();
		expect(() => captured?.color.view).toThrow("destroyed");
	} finally {
		preview.dispose();
		exported.dispose();
		source.dispose();
		estimate.mockRestore();
		gpu.dispose();
	}
});

test("RAW noise fitting rejects textured outliers and retains per-phase shot/read variance", () => {
	const samples = new Float32Array(1024 * 8);
	for (let i = 0; i < 1024; i++) {
		for (let c = 0; c < 4; c++) {
			const signal = 0.01 + Math.floor(i / 64) * 0.05;
			samples[i * 8 + c] = signal;
			samples[i * 8 + 4 + c] =
				((c + 1) * 0.0002 * signal + (c + 1) * 0.000001) *
				(i % 4 === 0 ? 50 : 1);
		}
	}
	const model = fitNoiseModel(samples);
	for (let c = 0; c < 4; c++) {
		expect(model.shot[c]).toBeCloseTo((c + 1) * 0.0002, 7);
		expect(model.read[c]).toBeCloseTo((c + 1) * 0.000001, 8);
	}
	for (const input of [new Float32Array(0), new Float32Array(256)]) {
		const model = fitNoiseModel(input);
		expect([...model.shot, ...model.read].every(Number.isFinite)).toBe(true);
		expect(model.read.every((value) => value > 0)).toBe(true);
	}
});

test("RAW noise fitting keeps a measured shadow floor when bright texture distorts the shot slope", () => {
	const samples = new Float32Array(1024 * 8);
	for (let i = 0; i < 1024; i++) {
		const signal = 0.005 + Math.floor(i / 64) * 0.05;
		for (let c = 0; c < 4; c++) {
			samples[i * 8 + c] = signal;
			samples[i * 8 + 4 + c] =
				0.0002 * signal + 0.000004 + 0.004 * signal * signal;
		}
	}
	// The observed dark-patch variance is 5.1e-6. It must not turn into a near-zero
	// denominator for signed shadow normalization merely because the slope hits its bound.
	const model = fitNoiseModel(samples);
	expect(model.read.every((value) => value > 1e-7)).toBe(true);
});
