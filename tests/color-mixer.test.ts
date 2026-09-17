import { expect, test } from "bun:test";
import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { defaultAdjustments } from "@/features/adjustments/model";
import { resetColorMixer, setColorMixer } from "@/features/color-mixer/edits";
import { defaultCurve } from "@/features/tone-curves/curve";

test("color edits validate, group, cancel and reset while renderers reuse and release their outputs", async () => {
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
		setColorMixer(document, "blue", { hue: 0 });
		resetColorMixer(document);
		expect(document.history.status.getState().undoCount).toBe(0);
		document.history.begin();
		setColorMixer(document, "blue", { hue: 10 });
		setColorMixer(document, "blue", { hue: 25, saturation: -20 });
		document.history.commit();
		expect(document.history.status.getState().undoCount).toBe(1);
		const scene = document.scene.getState();
		expect(scene.colorMixer?.hue[5]).toBe(25);
		expect(scene.colorMixer?.saturation[5]).toBe(-20);
		await renderer.update(scene);
		const edited = renderer.outputImage();
		expect(edited).not.toBe(original);
		expect(edited.format).toBe("rgba16float");
		const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
		const pipelines = calls.createRenderPipeline;
		setColorMixer(document, "blue", { hue: 25 });
		expect(document.history.status.getState().undoCount).toBe(1);
		document.history.begin();
		setColorMixer(document, "red", { luminance: 100 });
		document.history.cancel();
		expect(document.scene.getState()).toEqual(scene);
		document.history.undo();
		await renderer.update(document.scene.getState());
		expect(renderer.outputImage()).toBe(original);
		document.history.redo();
		await renderer.update(document.scene.getState());
		expect(renderer.inspect().passes).toEqual(["adjustments", "color-mixer"]);
		expect(calls.createRenderPipeline).toBe(pipelines);
		for (const value of [NaN, Infinity, -101, 101]) {
			expect(() => setColorMixer(document, "red", { hue: value })).toThrow(
				"Invalid",
			);
		}
		expect(() =>
			Reflect.apply(setColorMixer, undefined, [document, "pink", { hue: 2 }]),
		).toThrow("Invalid");
		expect(() =>
			Reflect.apply(setColorMixer, undefined, [
				document,
				"red",
				{ contrast: 2 },
			]),
		).toThrow("Invalid");
		expect(document.scene.getState()).toEqual(scene);
		resetColorMixer(document);
		expect(document.scene.getState().colorMixer).toBeUndefined();
		document.history.undo();
		expect(document.scene.getState()).toEqual(scene);
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
