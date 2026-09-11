import { expect, spyOn, test } from "bun:test";
import { init, target } from "vgpu/mock";
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
