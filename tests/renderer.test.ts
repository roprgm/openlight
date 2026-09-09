import { expect, mock, test } from "bun:test";
import type { Target } from "vgpu";
import {
	frame,
	getMockGPUDeviceInstrumentation,
	init,
	target,
} from "vgpu/mock";
import { setWhiteBalance } from "@/features/white-balance/edits";
import { createDocument } from "@/lib/editor/document";
import { setAdjustments, setToneCurve } from "@/lib/editor/document/edits";
import { createResources } from "@/lib/editor/document/resources";
import { createRenderer } from "@/lib/editor/renderer";
import { defaultAdjustments } from "@/lib/editor/scene";
import { createDisplay } from "@/lib/image-display";
import { imageFrame } from "@/lib/image-frame/geometry";
import { createImageSource } from "@/lib/image-source";
import { defaultCurve } from "@/lib/tone-curves/curve";
import { createUnsharpMask } from "@/lib/unsharp-mask";

test("RAW edits coalesce, recover from failure, and retain an exporting source after document replacement", async () => {
	const gpu = await init();
	const image = target(gpu, { size: [8, 8], format: "rgba16float" });
	const asShot = { temperature: 5000, tint: 10 };
	const requests: ReturnType<typeof Promise.withResolvers<void>>[] = [];
	const outputs: Target[] = [];
	const started = Promise.withResolvers<void>();
	const close = mock(() => {});
	const develop = mock(() => {
		const request = Promise.withResolvers<void>();
		requests.push(request);
		started.resolve();
		return request.promise;
	});
	const source = createImageSource(image, {
		asShot,
		createPass() {
			const output = target(gpu, { size: image.size, format: image.format });
			outputs.push(output);
			return {
				prepare: (balance) =>
					balance.temperature === asShot.temperature &&
					balance.tint === asShot.tint
						? Promise.resolve()
						: develop(),
				render: () => output,
				dispose: () => output.color.dispose(),
			};
		},
		dispose: close,
	});
	const resources = createResources();
	const id = resources.add(new File([], "photo.nef"), source);
	const document = createDocument(
		{
			source: id,
			frame: imageFrame(image.size),
			adjustments: { ...defaultAdjustments },
			toneCurve: defaultCurve,
			whiteBalance: asShot,
		},
		resources,
	);
	const preview = createRenderer(gpu, source);
	const exported = createRenderer(gpu, source);
	const notify = mock(() => {});
	preview.subscribe(notify);
	try {
		// An edit in the same tick as the initial render must not be lost.
		const initial = preview.update(document.scene.getState());
		setWhiteBalance(document, { temperature: 2000 });
		preview.update(document.scene.getState());
		await started.promise;
		expect(develop).toHaveBeenCalledTimes(1);
		setWhiteBalance(document, { temperature: 3000 });
		preview.update(document.scene.getState());
		setWhiteBalance(document);
		preview.update(document.scene.getState());
		requests[0].resolve();
		await initial;
		expect(develop).toHaveBeenCalledTimes(1);
		expect(notify).toHaveBeenCalledTimes(2);
		expect(outputs).toHaveLength(2);
		document.history.undo();
		expect(document.scene.getState().whiteBalance?.temperature).toBe(3000);
		const failed = preview.update(document.scene.getState());
		requests[1].reject(Error("Decode failure"));
		await expect(failed).rejects.toThrow("Decode failure");
		const superseded = preview.update(document.scene.getState());
		setWhiteBalance(document);
		preview.update(document.scene.getState());
		requests[2].reject(Error("Superseded failure"));
		await superseded;
		setWhiteBalance(document, { temperature: 6500 });
		const recovered = preview.update(document.scene.getState());
		requests[3].resolve();
		await recovered;
		expect(() => setWhiteBalance(document, { temperature: NaN })).toThrow(
			"Invalid",
		);
		const exporting = exported.update(document.scene.getState());
		preview.dispose();
		document.dispose();
		expect(close).not.toHaveBeenCalled();
		expect(() => image.color.view).not.toThrow();
		requests[4].resolve();
		await exporting;
		expect(exported.outputImage().size).toEqual([8, 8]);
		exported.dispose();
		expect(close).toHaveBeenCalledTimes(1);
		expect(() => image.color.view).toThrow("destroyed");
		for (const output of outputs) {
			expect(() => output.color.view).toThrow("destroyed");
		}
	} finally {
		preview.dispose();
		exported.dispose();
		document.dispose();
		gpu.dispose();
	}
});

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
	const resource = createImageSource(source);
	const renderer = createRenderer(gpu, resource);
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
		resource.dispose();
		gpu.dispose();
	}
});
