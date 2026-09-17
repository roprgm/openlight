import { expect, mock, spyOn, test } from "bun:test";
import type { RawMetadata } from "raw-webgpu";
import type { Frame, Target } from "vgpu";
import { init, target } from "vgpu/mock";
import { setNoiseReduction } from "@/features/noise-reduction/edits";
import * as bayer from "@/features/noise-reduction/processing/bayer";
import { fitNoiseModel } from "@/features/noise-reduction/processing/bayer/noise";
import { createBayerDenoising } from "@/features/noise-reduction/processing/bayer/source";
import { createCachedDenoising } from "@/features/noise-reduction/processing/cache";
import * as noise from "@/features/noise-reduction/processing/noise";
import { createDocument } from "@/lib/editor/document";
import { createRenderer } from "@/lib/editor/renderer";
import { defaultAdjustments, type Scene } from "@/lib/editor/scene";
import { imageFrame } from "@/lib/image-frame/geometry";
import { createImageSource } from "@/lib/image-source";
import { defaultCurve } from "@/lib/tone-curves/curve";

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

test("noise edits validate and group while asynchronous preparation coalesces and closes safely", async () => {
	const gpu = await init();
	const image = target(gpu, { size: [32, 32], format: "rgba16float" });
	const source = createImageSource(image);
	const document = createDocument({
		source: "photo",
		frame: imageFrame(image.size),
		adjustments: defaultAdjustments,
		toneCurve: defaultCurve,
	});
	const prepared = Promise.withResolvers<void>();
	const prepare = mock(() => prepared.promise);
	const render = mock((_frame: Frame, input: Target, _scene: Scene) => input);
	const dispose = mock(() => {});
	const renderer = createRenderer(gpu, source, {
		beforeAdjustments: () => ({ prepare, render, dispose }),
	});
	try {
		setNoiseReduction(document, 0);
		expect(document.history.status.getState().undoCount).toBe(0);
		for (const amount of [NaN, Infinity, -1, 101]) {
			expect(() => setNoiseReduction(document, amount)).toThrow(
				"between 0 and 100",
			);
		}
		document.history.begin();
		setNoiseReduction(document, 10);
		const pending = renderer.update(document.scene.getState());
		setNoiseReduction(document, 80);
		const latest = renderer.update(document.scene.getState());
		document.history.commit();
		prepared.resolve();
		await Promise.all([pending, latest]);
		expect(render).toHaveBeenCalledTimes(1);
		expect(render.mock.calls[0][2].noiseReduction).toBe(80);
		expect(document.history.status.getState().undoCount).toBe(1);
		document.history.undo();
		expect(document.scene.getState().noiseReduction ?? 0).toBe(0);
		document.history.redo();
		expect(document.scene.getState().noiseReduction).toBe(80);
		document.history.begin();
		setNoiseReduction(document, 50);
		document.history.cancel();
		expect(document.scene.getState().noiseReduction).toBe(80);
		const closing = renderer.update(document.scene.getState());
		renderer.dispose();
		await closing;
		expect(render).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(() => image.color.view).not.toThrow();
	} finally {
		renderer.dispose();
		document.dispose();
		source.dispose();
		gpu.dispose();
	}
});

test("private Bayer copies share work, retry failures and release cancelled results", async () => {
	const gpu = await init();
	const metadata: RawMetadata = {
		size: [32, 32],
		flip: 0,
		cfa: [0, 1, 1, 2],
		black: [0, 0, 0, 0],
		white: 65535,
		vignette: [],
		demosaic: "gpu",
	};
	const image = target(gpu, { size: metadata.size, format: "r16uint" });
	const requests: ReturnType<typeof Promise.withResolvers<void>>[] = [];
	const calculate = spyOn(bayer, "denoiseBayer").mockImplementation(() => {
		const request = Promise.withResolvers<void>();
		requests.push(request);
		return request.promise;
	});
	const released = [mock(() => {}), mock(() => {}), mock(() => {})];
	const clone = mock(async () => ({
		metadata,
		texture: image.color.gpu,
		createPass: () => {
			throw Error("Not developed in this lifecycle test.");
		},
		dispose: released[clone.mock.calls.length - 1],
	}));
	const cache = createBayerDenoising(gpu, { metadata, clone });
	if (!cache) {
		throw Error("Expected Bayer support.");
	}
	try {
		const failed = cache.prepare();

		await Promise.resolve();
		requests[0].reject(Error("Filter failure"));
		await expect(failed).rejects.toThrow("Filter failure");
		expect(released[0]).toHaveBeenCalledTimes(1);
		const pending = cache.prepare();
		expect(cache.prepare()).toBe(pending);
		await Promise.resolve();
		requests[1].resolve();
		const result = await pending;
		expect(await cache.prepare()).toBe(result);
		expect(clone).toHaveBeenCalledTimes(2);
		cache.dispose();
		expect(released[1]).toHaveBeenCalledTimes(1);
		const cancelled = createBayerDenoising(gpu, { metadata, clone });
		if (!cancelled) {
			throw Error("Expected Bayer support.");
		}
		const late = cancelled.prepare();

		await Promise.resolve();
		cancelled.dispose();
		requests[2].resolve();
		await expect(late).rejects.toThrow();
		expect(released[2]).toHaveBeenCalledTimes(1);
	} finally {
		calculate.mockRestore();
		image.color.dispose();
		gpu.dispose();
	}
});
