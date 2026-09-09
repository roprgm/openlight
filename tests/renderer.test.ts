import { expect, mock, test } from "bun:test";
import {
	frame,
	getMockGPUDeviceInstrumentation,
	init,
	target,
} from "vgpu/mock";
import { createDocument } from "@/lib/editor/document";
import { setAdjustments, setToneCurve } from "@/lib/editor/document/edits";
import { createRenderer } from "@/lib/editor/renderer";
import { defaultAdjustments } from "@/lib/editor/scene";
import { createDisplay } from "@/lib/image-display";
import { imageFrame } from "@/lib/image-frame/geometry";
import { defaultCurve } from "@/lib/tone-curves/curve";
import { createUnsharpMask } from "@/lib/unsharp-mask";

test.each([1, 16])(
	"unsharp mask at reduction %s bypasses zero, reuses pipelines, and owns its outputs",
	async (reduction) => {
		const gpu = await init();
		const source = target(gpu, { size: [127, 65], format: "rgba16float" });
		const clarity = createUnsharpMask(gpu, source, reduction);
		let output = source;
		const render = (amount: number) =>
			frame(gpu, (f) => {
				output = clarity.render(
					f,
					source,
					amount / 200,
					reduction === 1 ? 1 : 64,
				);
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
	},
);

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
	const renderer = createRenderer(gpu, { image: source });
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
		setAdjustments(document, {
			exposure: -1,
			clarity: 50,
			sharpening: 100,
			sharpenRadius: 2,
		});
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

test("absolute white balance is a source capability, with independent render stages and reversible edits", async () => {
	const gpu = await init();
	const source = target(gpu, { size: [8, 8], format: "rgba16float" });
	const { createResources } = await import("@/lib/editor/document/resources");
	const { setWhiteBalance } = await import("@/features/white-balance/edits");
	const resources = createResources();
	const asShot = { temperature: 5100, tint: 12 };
	const released = mock(() => {});
	const updates: unknown[] = [];
	const outputs: (typeof source)[] = [];
	// A source from an arbitrary loader: neither DNG metadata nor a filename controls this capability.
	const capability = {
		asShot,
		dispose: released,
		create() {
			const output = target(gpu, { size: source.size, format: source.format });
			outputs.push(output);
			return {
				render(_frame: unknown, balance = asShot) {
					updates.push(balance);
					return output;
				},
				dispose: () => output.color.dispose(),
			};
		},
	};
	const decoded = { image: source, whiteBalance: capability };
	const id = resources.add(new File([], "custom.camera"), decoded);
	const document = createDocument(
		{
			source: id,
			frame: imageFrame(source.size),
			adjustments: { ...defaultAdjustments },
			toneCurve: defaultCurve,
			whiteBalance: asShot,
		},
		resources,
	);
	const preview = createRenderer(gpu, decoded);
	const exported = createRenderer(gpu, decoded);
	try {
		document.history.begin();
		setWhiteBalance(document, { temperature: 2000 });
		setWhiteBalance(document, { tint: 30 });
		document.history.commit();
		const scene = document.scene.getState();
		preview.update(scene);
		exported.update(scene);
		expect(updates).toEqual([
			{ temperature: 2000, tint: 30 },
			{ temperature: 2000, tint: 30 },
		]);
		expect(outputs[0]).not.toBe(outputs[1]);
		expect(preview.stages[0].id).toBe("white-balance");
		document.history.undo();
		expect(document.scene.getState().whiteBalance).toEqual(asShot);
		document.history.redo();
		expect(document.scene.getState().whiteBalance).toEqual(scene.whiteBalance);
		setWhiteBalance(document);
		expect(document.scene.getState().whiteBalance).toEqual(asShot);
		for (const temperature of [0, Number.NaN, Infinity, 25001])
			expect(() => setWhiteBalance(document, { temperature })).toThrow(
				"Invalid white balance",
			);
		expect(() =>
			document.edit({ ...scene, whiteBalance: { temperature: 0, tint: 0 } }),
		).toThrow("Invalid white balance");
		preview.dispose();
		exported.dispose();
		for (const output of outputs)
			expect(() => output.color.view).toThrow("destroyed");
		expect(released).not.toHaveBeenCalled();
		expect(() => source.color.view).not.toThrow();
		document.dispose();
		expect(released).toHaveBeenCalledTimes(1);
	} finally {
		preview.dispose();
		exported.dispose();
		document.dispose();
		gpu.dispose();
	}
});
