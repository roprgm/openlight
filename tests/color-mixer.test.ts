import { expect, test } from "bun:test";
import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { resetColorMixer, setColorMixer } from "@/features/color-mixer/edits";
import { defaultMixer } from "@/features/color-mixer/model";

test("color edits validate, group, cancel and reset while renderers reuse and release their outputs", async () => {
	const gpu = await init();
	const image = target(gpu, { size: [32, 16], format: "rgba16float" });
	const source = createImageSource(image);
	const document = createDocument({
		frame: imageFrame(image.size),
		layers: [
			{
				...createImageLayer("photo", "Photo"),
				id: "base",
				children: [{ ...createLayer("color-mixer"), id: "mixer" }],
			},
		],
	});
	const renderer = createEditorRenderer(gpu, source);
	try {
		await renderer.update(document.scene.getState());
		setColorMixer(document, "blue", { hue: 0 }, "mixer");
		resetColorMixer(document, "mixer");
		expect(document.history.status.getState().undoCount).toBe(0);
		document.history.begin();
		setColorMixer(document, "blue", { hue: 10 }, "mixer");
		setColorMixer(document, "blue", { hue: 25, saturation: -20 }, "mixer");
		document.history.commit();
		expect(document.history.status.getState().undoCount).toBe(1);
		const scene = document.scene.getState();
		const mixer = scene.layers[0].children[0];
		expect(mixer?.kind === "color-mixer" && mixer.colorMixer.hue[5]).toBe(25);
		expect(
			mixer?.kind === "color-mixer" && mixer.colorMixer.saturation[5],
		).toBe(-20);
		await renderer.update(scene);
		expect(renderer.inspect().passes).toEqual(["layer/mixer/color-mixer"]);
		const edited = renderer.outputImage();
		expect(edited.format).toBe("rgba16float");
		const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
		const pipelines = calls.createRenderPipeline;
		setColorMixer(document, "blue", { hue: 25 }, "mixer");
		expect(document.history.status.getState().undoCount).toBe(1);
		document.history.begin();
		setColorMixer(document, "red", { luminance: 100 }, "mixer");
		document.history.cancel();
		expect(document.scene.getState()).toEqual(scene);
		document.history.undo();
		await renderer.update(document.scene.getState());
		expect(renderer.inspect().passes).toEqual([]);
		document.history.redo();
		await renderer.update(document.scene.getState());
		expect(renderer.inspect().passes).toEqual(["layer/mixer/color-mixer"]);
		expect(calls.createRenderPipeline).toBe(pipelines);
		for (const value of [NaN, Infinity, -101, 101]) {
			expect(() =>
				setColorMixer(document, "red", { hue: value }, "mixer"),
			).toThrow("Invalid");
		}
		expect(() =>
			Reflect.apply(setColorMixer, undefined, [
				document,
				"pink",
				{ hue: 2 },
				"mixer",
			]),
		).toThrow("Invalid");
		expect(() =>
			Reflect.apply(setColorMixer, undefined, [
				document,
				"red",
				{ contrast: 2 },
				"mixer",
			]),
		).toThrow("Invalid");
		expect(document.scene.getState()).toEqual(scene);
		resetColorMixer(document, "mixer");
		expect(document.scene.getState().layers[0].children[0]).toMatchObject({
			colorMixer: defaultMixer,
		});
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
