import { expect, mock, test } from "bun:test";
import {
	frame,
	getMockGPUDeviceInstrumentation,
	init,
	target,
} from "vgpu/mock";
import { createDocument } from "@/app/document";
import { setAdjustments, setToneCurve } from "@/app/document/edits";
import { createRenderer } from "@/app/editor/renderer/renderer";
import { defaultAdjustments } from "@/app/scene";
import { defaultCurve } from "@/features/tone-curves/curve";

test("rendering follows grouped edits and undo, reuses pipelines, and releases owned targets", async () => {
	const gpu = await init();
	const source = target(gpu, { size: [32, 16], format: "rgba16float" });
	const canvas = Object.assign(target(gpu, { size: [64, 32] }), { dpr: 2 });
	const document = createDocument({
		size: [32, 16],
		source: "photo",
		adjustments: { ...defaultAdjustments },
		toneCurve: defaultCurve,
	});
	const renderer = createRenderer(gpu, source);
	const notify = mock(() => {});
	const detach = renderer.subscribe(notify);
	const unsubscribe = document.scene.subscribe(renderer.update);
	const draw = () =>
		frame(gpu, (frame) =>
			renderer.draw(frame, canvas, { pan: [4, 8], zoom: 2 }),
		);
	try {
		draw();
		expect(notify).not.toHaveBeenCalled();
		renderer.update(document.scene.getState());
		const adjusted = renderer.inputImage();
		expect(adjusted.size).toEqual(source.size);
		expect(adjusted.format).toBe(source.format);
		expect(renderer.outputImage()).toBe(adjusted);
		document.history.begin();
		setAdjustments(document, { exposure: 0.5 });
		setAdjustments(document, { exposure: 1 });
		setToneCurve(document, [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.7 },
			{ x: 1, y: 1 },
		]);
		document.history.commit();
		const curved = renderer.outputImage();
		expect(curved).not.toBe(adjusted);
		expect(curved.size).toEqual(source.size);
		expect(renderer.inputImage()).toBe(adjusted);
		expect(document.history.status.getState()).toEqual({
			undoCount: 1,
			redoCount: 0,
		});
		draw();
		const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
		const pipelines = calls.createRenderPipeline;
		expect(pipelines).toBeGreaterThan(0);
		const late = mock(() => {});
		const detachLate = renderer.subscribe(late);
		expect(late).toHaveBeenCalledTimes(1);
		detachLate();
		document.history.undo();
		expect(renderer.outputImage()).toBe(adjusted);
		expect(document.scene.getState().adjustments.exposure).toBe(0);
		document.history.redo();
		expect(renderer.outputImage()).toBe(curved);
		document.history.begin();
		setToneCurve(document);
		expect(renderer.outputImage()).toBe(adjusted);
		document.history.cancel();
		expect(renderer.outputImage()).toBe(curved);
		draw();
		expect(calls.createRenderPipeline).toBe(pipelines);
		expect(notify).toHaveBeenCalledTimes(8);
		expect(late).toHaveBeenCalledTimes(1);
		detach();
		setAdjustments(document, { exposure: -1 });
		expect(notify).toHaveBeenCalledTimes(8);
		document.edit({
			...document.scene.getState(),
			size: [16, 8],
			geometry: {
				...document.scene.getState().geometry,
				width: 0.5,
				height: 0.5,
				angle: 10,
			},
		});
		const croppedInput = renderer.inputImage();
		const croppedOutput = renderer.outputImage();
		expect(croppedOutput.size).toEqual([16, 8]);
		expect(croppedInput.size).toEqual([16, 8]);
		renderer.dispose();
		expect(() => croppedInput.color.view).toThrow("destroyed");
		expect(() => croppedOutput.color.view).toThrow("destroyed");
		expect(() => adjusted.color.view).toThrow("destroyed");
		expect(() => curved.color.view).toThrow("destroyed");
		expect(() => source.color.view).not.toThrow();
	} finally {
		unsubscribe();
		detach();
		renderer.dispose();
		document.dispose();
		gpu.dispose();
	}
});
