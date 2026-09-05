import { expect, mock, test } from "bun:test";
import {
	frame,
	getMockGPUDeviceInstrumentation,
	init,
	target,
} from "vgpu/mock";
import { createDocument } from "@/app/document";
import {
	createImageLayer,
	setAdjustments,
	setToneCurve,
} from "@/app/document/edits";
import { createResources } from "@/app/document/resources";
import { createRenderer } from "@/app/editor/renderer/renderer";

test("rendering follows grouped edits and undo, reuses pipelines, and releases owned targets", async () => {
	const gpu = await init();
	const source = target(gpu, { size: [32, 16], format: "rgba16float" });
	const canvas = Object.assign(target(gpu, { size: [64, 32] }), { dpr: 2 });
	const resources = createResources();
	const id = resources.add(new File([], "photo.png"), source);
	const document = createDocument(
		{ size: [32, 16], layers: [createImageLayer(id, "Photo")] },
		resources,
	);
	const renderer = createRenderer(gpu, document);
	const notify = mock(() => {});
	const detach = renderer.subscribe(notify);
	const unsubscribe = document.scene.subscribe(() =>
		renderer.update(document.scene.getState()),
	);
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
		expect(renderer.outputImage()).not.toBe(adjusted);
		document.history.begin();
		setAdjustments(document, { exposure: 0.5 });
		setAdjustments(document, { exposure: 1 });
		setToneCurve(document, [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.7 },
			{ x: 1, y: 1 },
		]);
		document.history.commit();
		const composite = renderer.outputImage();
		expect(composite).not.toBe(adjusted);
		expect(composite.size).toEqual(source.size);
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
		expect(renderer.outputImage()).toBe(composite);
		expect(document.scene.getState().layers[0].adjustments.exposure).toBe(0);
		document.history.redo();
		expect(renderer.outputImage()).toBe(composite);
		document.history.begin();
		setToneCurve(document);
		expect(renderer.outputImage()).toBe(composite);
		document.history.cancel();
		expect(renderer.outputImage()).toBe(composite);
		draw();
		expect(calls.createRenderPipeline).toBe(pipelines);
		expect(notify).toHaveBeenCalledTimes(8);
		expect(late).toHaveBeenCalledTimes(1);
		detach();
		setAdjustments(document, { exposure: -1 });
		expect(notify).toHaveBeenCalledTimes(8);
		renderer.dispose();
		expect(() => adjusted.color.view).toThrow("destroyed");
		expect(() => composite.color.view).toThrow("destroyed");
		expect(() => source.color.view).not.toThrow();
	} finally {
		unsubscribe();
		detach();
		renderer.dispose();
		document.dispose();
		gpu.dispose();
	}
});
