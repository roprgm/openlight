import { expect, test } from "bun:test";
import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import { createEditorRenderer } from "@/app/editor/renderer";
import { setVignette } from "@/features/vignette/edits";
import { createDocument } from "@/lib/editor/document";
import { defaultAdjustments } from "@/lib/editor/scene";
import { imageFrame } from "@/lib/image-frame/geometry";
import { createImageSource } from "@/lib/image-source";
import { defaultCurve } from "@/lib/tone-curves/curve";

test("vignette edits validate, group and cancel; rendering bypasses zero, reuses and releases output", async () => {
	const gpu = await init();
	const image = target(gpu, { size: [32, 16], format: "rgba16float" });
	const source = createImageSource(image);
	const document = createDocument({
		source: "photo",
		frame: imageFrame(image.size),
		adjustments: defaultAdjustments,
		toneCurve: defaultCurve,
	});
	const renderer = createEditorRenderer(gpu, source);
	try {
		await renderer.update(document.scene.getState());
		const original = renderer.outputImage();
		setVignette(document, { intensity: 0 });
		expect(document.history.status.getState().undoCount).toBe(0);
		setVignette(document, { softness: 100 });
		await renderer.update(document.scene.getState());
		expect(renderer.outputImage()).toBe(original);
		document.history.begin();
		setVignette(document, { intensity: 30 });
		setVignette(document, { intensity: 80, softness: 60 });
		document.history.commit();
		expect(document.history.status.getState().undoCount).toBe(2);
		const scene = document.scene.getState();
		await renderer.update(scene);
		const edited = renderer.outputImage();
		expect(edited).not.toBe(original);
		expect(edited.format).toBe("rgba16float");
		const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
		const pipelines = calls.createRenderPipeline;
		setVignette(document, { intensity: 80 });
		expect(document.history.status.getState().undoCount).toBe(2);
		document.history.begin();
		setVignette(document, { softness: 0 });
		document.history.cancel();
		expect(document.scene.getState()).toEqual(scene);
		document.history.undo();
		await renderer.update(document.scene.getState());
		expect(renderer.outputImage()).toBe(original);
		document.history.redo();
		await renderer.update(document.scene.getState());
		expect(renderer.outputImage()).toBe(edited);
		expect(calls.createRenderPipeline).toBe(pipelines);
		for (const name of ["intensity", "softness"]) {
			for (const value of [NaN, Infinity, -1, 101, "50"]) {
				expect(() => setVignette(document, { [name]: value })).toThrow(
					"Invalid",
				);
			}
		}
		expect(() =>
			Reflect.apply(setVignette, undefined, [document, { radius: 10 }]),
		).toThrow("Invalid");
		expect(document.scene.getState()).toEqual(scene);
		setVignette(document, { intensity: 0 });
		expect(document.scene.getState().vignette?.softness).toBe(60);
		await renderer.update(document.scene.getState());
		expect(renderer.outputImage()).toBe(original);
		renderer.dispose();
		expect(() => edited.color.view).toThrow("destroyed");
		expect(() => image.color.view).not.toThrow();
	} finally {
		renderer.dispose();
		document.dispose();
		source.dispose();
		gpu.dispose();
	}
});
