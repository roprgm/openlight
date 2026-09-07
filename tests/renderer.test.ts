import { expect, mock, test } from "bun:test";
import {
	frame,
	getMockGPUDeviceInstrumentation,
	init,
	target,
} from "vgpu/mock";
import { createClarity } from "@/lib/clarity";
import { createDocument } from "@/lib/editor/document";
import { setAdjustments, setToneCurve } from "@/lib/editor/document/edits";
import { createRenderer } from "@/lib/editor/renderer";
import { defaultAdjustments } from "@/lib/editor/scene";
import { createDisplay } from "@/lib/image-display";
import { imageFrame } from "@/lib/image-frame/geometry";
import { defaultCurve } from "@/lib/tone-curves/curve";

test("clarity bypasses zero, reuses its pipeline across amounts, and owns only its outputs", async () => {
	const gpu = await init();
	const source = target(gpu, { size: [127, 65], format: "rgba16float" });
	const clarity = createClarity(gpu, source);
	let output = source;
	const render = (amount: number) =>
		frame(gpu, (f) => {
			output = clarity.render(f, source, amount);
		});
	try {
		render(0);
		expect(output).toBe(source);
		const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
		expect(calls.createRenderPipeline ?? 0).toBe(0);
		render(100);
		const filtered = output;
		expect(filtered).not.toBe(source);
		expect(filtered.size).toEqual(source.size);
		const pipelines = calls.createRenderPipeline;
		for (const amount of [-100, -50, 25, 75]) {
			render(amount);
			expect(output).toBe(filtered);
		}
		expect(calls.createRenderPipeline).toBe(pipelines);
		render(0);
		expect(output).toBe(source);
		clarity.dispose();
		expect(() => filtered.color.view).toThrow("destroyed");
		expect(() => source.color.view).not.toThrow();
	} finally {
		clarity.dispose();
		source.color.dispose();
		gpu.dispose();
	}
});

test("rendering follows grouped edits and undo, reuses pipelines, and releases owned targets", async () => {
	const gpu = await init();
	const source = target(gpu, { size: [32, 16], format: "rgba16float" });
	const canvas = Object.assign(target(gpu, { size: [64, 32] }), { dpr: 2 });
	const document = createDocument({
		frame: imageFrame([32, 16]),
		source: "photo",
		adjustments: { ...defaultAdjustments },
		toneCurve: defaultCurve,
	});
	const renderer = createRenderer(gpu, source);
	const notify = mock(() => {});
	const detach = renderer.subscribe(notify);
	const unsubscribe = document.scene.subscribe(renderer.update);
	const display = createDisplay(gpu);
	const draw = () =>
		frame(gpu, (frame) =>
			display(frame, canvas, renderer.outputImage(), {
				view: { pan: [4, 8], zoom: 2 },
			}),
		);
	try {
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
		setAdjustments(document, { exposure: -1, clarity: 50 });
		expect(notify).toHaveBeenCalledTimes(8);
		document.edit({
			...document.scene.getState(),
			frame: {
				...document.scene.getState().frame,
				size: [16, 8],
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
