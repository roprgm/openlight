import { expect, spyOn, test } from "bun:test";
import type { Target } from "vgpu";
import { init, target } from "vgpu/mock";
import { setNoiseReduction } from "@/features/noise-reduction/edits";
import { createCachedDenoising } from "@/lib/denoise/cache";
import * as noise from "@/lib/denoise/noise";
import { createDocument } from "@/lib/editor/document";
import { setAdjustments } from "@/lib/editor/document/edits";
import { createRenderer } from "@/lib/editor/renderer";
import { defaultAdjustments } from "@/lib/editor/scene";
import { imageFrame } from "@/lib/image-frame/geometry";
import { createImageSource } from "@/lib/image-source";
import { defaultCurve } from "@/lib/tone-curves/curve";

test("denoising shares work, isolates WB snapshots, retains active exports, and cancels on close", async () => {
	const gpu = await init();
	const model = Array.from({ length: 16 }, () => [
		0.0004, 0.0004, 0.0004, 1e-10,
	]);
	// The mock does not execute shaders. Substitute only their measured statistics.
	const estimate = spyOn(noise, "estimateNoise").mockResolvedValue(model);
	const createEncoder = gpu.gpu.createCommandEncoder.bind(gpu.gpu);
	const encoder = spyOn(gpu.gpu, "createCommandEncoder").mockImplementation(
		(descriptor) =>
			Object.assign(createEncoder(descriptor), {
				// vgpu/mock does not implement clearBuffer yet.
				clearBuffer(buffer: GPUBuffer) {
					gpu.gpu.queue.writeBuffer(buffer, 0, new Uint8Array(buffer.size));
				},
			}),
	);
	const image = target(gpu, { size: [32, 32], format: "rgba16float" });
	const developed: Target[] = [];
	const resource = createImageSource(image, {
		asShot: { temperature: 5000, tint: 0 },
		createPass() {
			const output = target(gpu, { size: image.size, format: image.format });
			developed.push(output);
			return {
				prepare: async () => {},
				render: () => output,
				dispose: () => output.color.dispose(),
			};
		},
		dispose() {},
	});
	const preview = createCachedDenoising(gpu, resource);
	const exported = createCachedDenoising(gpu, resource);
	try {
		await Promise.all([preview.prepare(), exported.prepare()]);
		expect(estimate).toHaveBeenCalledTimes(1);
		const original = preview.texture();
		expect(original).toBe(exported.texture());
		await preview.prepare({ temperature: 2000, tint: 20 });
		expect(estimate).toHaveBeenCalledTimes(2);
		expect(preview.texture()).not.toBe(original);
		expect(exported.texture()).toBe(original);
		expect(() => original?.color.view).not.toThrow();
		// Joining the preview's WB result frees the unused previous snapshot.
		await exported.prepare({ temperature: 2000, tint: 20 });
		expect(estimate).toHaveBeenCalledTimes(2);
		expect(() => original?.color.view).toThrow("destroyed");
		const current = exported.texture();
		preview.dispose();
		expect(() => current?.color.view).not.toThrow();
		exported.dispose();
		expect(() => current?.color.view).toThrow("destroyed");
		for (const output of developed) {
			expect(() => output.color.view).toThrow("destroyed");
		}

		const closing = createCachedDenoising(gpu, resource);
		const measurement = Promise.withResolvers<number[][]>();
		estimate.mockReturnValueOnce(measurement.promise);
		const pending = closing.prepare();
		// Let RAW calibration hand control to the noise estimator.
		await Promise.resolve();
		closing.dispose();
		measurement.resolve(model);
		await expect(pending).rejects.toThrow();
		expect(closing.texture()).toBeUndefined();
	} finally {
		preview.dispose();
		exported.dispose();
		resource.dispose();
		estimate.mockRestore();
		encoder.mockRestore();
		gpu.dispose();
	}
});

test("renderer coalesces noise edits, preserves history and zero, and retries failed preparation", async () => {
	const gpu = await init();
	// A noiseless measurement bypasses filtering; pixel behavior is tested in Chromium.
	const clean = Array.from({ length: 16 }, () => [1e-10, 1e-10, 1e-10, 1e-10]);
	const measurement = Promise.withResolvers<number[][]>();
	const estimate = spyOn(noise, "estimateNoise")
		.mockReturnValueOnce(measurement.promise)
		.mockResolvedValue(clean);
	const resource = createImageSource(
		target(gpu, { size: [32, 32], format: "rgba16float" }),
	);
	const document = createDocument({
		source: "photo",
		frame: imageFrame([32, 32]),
		adjustments: defaultAdjustments,
		toneCurve: defaultCurve,
	});
	const renderer = createRenderer(gpu, resource);
	try {
		await renderer.update(document.scene.getState());
		expect(estimate).not.toHaveBeenCalled();
		setNoiseReduction(document, 100);
		const first = renderer.update(document.scene.getState());
		setAdjustments(document, { exposure: 1 });
		setNoiseReduction(document, 25);
		const last = renderer.update(document.scene.getState());
		measurement.resolve(clean);
		await Promise.all([first, last]);
		expect(estimate).toHaveBeenCalledTimes(1);
		expect(document.scene.getState()).toMatchObject({
			noiseReduction: 25,
			adjustments: { exposure: 1 },
		});
		setNoiseReduction(document, 0);
		await renderer.update(document.scene.getState());
		document.history.undo();
		expect(document.scene.getState().noiseReduction).toBe(25);
		await renderer.update(document.scene.getState());
		document.history.redo();
		await renderer.update(document.scene.getState());
		expect(estimate).toHaveBeenCalledTimes(1);
		for (const amount of [NaN, Infinity, -1, 101]) {
			expect(() => setNoiseReduction(document, amount)).toThrow();
		}
		renderer.dispose();
		const retry = createRenderer(gpu, resource);
		try {
			estimate.mockRejectedValueOnce(Error("Measurement failed"));
			setNoiseReduction(document, 50);
			await expect(retry.update(document.scene.getState())).rejects.toThrow(
				"Measurement failed",
			);
			await retry.update(document.scene.getState());
		} finally {
			retry.dispose();
		}
	} finally {
		renderer.dispose();
		document.dispose();
		resource.dispose();
		estimate.mockRestore();
		gpu.dispose();
	}
});
