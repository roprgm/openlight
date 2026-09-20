import { expect, mock, test } from "bun:test";
import type { Target } from "vgpu";
import {
	frame,
	getMockGPUDeviceInstrumentation,
	init,
	target,
} from "vgpu/mock";
import { createLayer } from "@/app/editor/layers";
import { createEditorRenderer as createRenderer } from "@/app/editor/renderer";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import {
	createDisplay,
	createRenderGraph,
	input,
	pipeline,
} from "@/core/renderer";
import { setAdjustments } from "@/features/adjustments/edits";
import { defaultAdjustments } from "@/features/adjustments/model";
import { unsharpMask } from "@/features/details/unsharp-mask";
import { setLayer } from "@/features/layers/edits";
import { defaultCurve } from "@/features/tone-curves/curve";
import { setToneCurve } from "@/features/tone-curves/edits";
import { setWhiteBalance } from "@/features/white-balance/edits";

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
			frame: imageFrame(image.size),
			layers: [
				{
					kind: "image",
					name: "Photo",
					children: [
						{
							id: "curve",
							name: "Curves",
							kind: "curves",
							visible: true,
							opacity: 1,
							children: [],
							toneCurve: defaultCurve,
						},
					],
					id: "base",
					source: id,
					adjustments: { ...defaultAdjustments },
					whiteBalance: asShot,
				},
			],
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
		expect(document.scene.getState().layers[0].whiteBalance?.temperature).toBe(
			3000,
		);
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
	"unsharp mask at reduction %s bypasses zero and shares graph storage",
	async (reduction) => {
		const gpu = await init();
		const source = target(gpu, { size: [127, 65], format: "rgba16float" });
		const graph = createRenderGraph(gpu);
		let output = source;
		const render = (amount: number) => {
			[output] = graph.render([
				pipeline(input(source), [
					unsharpMask(
						"detail",
						amount / 200,
						reduction === 1 ? 1 : 64,
						reduction,
					),
				]),
			]);
		};
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
			expect(graph.inspect().textures).toHaveLength(reduction === 1 ? 2 : 3);
			for (const amount of [-100, -50, 25, 75]) {
				render(amount);
				expect(output).toBe(filtered);
			}
			expect(calls.createRenderPipeline).toBe(pipelines);
			render(0);
			expect(output).toBe(source);
			expect(graph.inspect().textures).toHaveLength(0);
			graph.dispose();
			expect(() => filtered.color.view).toThrow("destroyed");
			expect(() => source.color.view).not.toThrow();
		} finally {
			graph.dispose();
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
		layers: [
			{
				kind: "image",
				name: "Photo",
				children: [
					{
						id: "curve",
						name: "Curves",
						kind: "curves",
						visible: true,
						opacity: 1,
						children: [],
						toneCurve: defaultCurve,
					},
				],
				id: "base",
				source: "photo",
				adjustments: { ...defaultAdjustments },
			},
		],
	});
	const resource = createImageSource(source);
	const renderer = createRenderer(gpu, resource);
	const notify = mock(() => {});
	const detach = renderer.subscribe(notify);
	const unsubscribe = document.scene.subscribe((scene) =>
		renderer.update(scene),
	);
	const display = createDisplay(gpu);
	const draw = () =>
		frame(gpu, (frame) =>
			display(frame, canvas, renderer.outputImage(), {
				view: { pan: [4, 8], zoom: 2 },
			}),
		);
	try {
		expect(notify).not.toHaveBeenCalled();
		await expect(
			renderer.update({
				...document.scene.getState(),
				get layers(): never {
					throw Error("Render failure");
				},
			}),
		).rejects.toThrow("Render failure");
		renderer.update(document.scene.getState());
		const adjusted = renderer.outputImage();
		expect(adjusted.size).toEqual(source.size);
		expect(adjusted.format).toBe(source.format);
		expect(renderer.outputImage()).toBe(adjusted);
		document.history.begin();
		setAdjustments(document, { exposure: 0.5 });
		setAdjustments(document, { exposure: 1 });
		setToneCurve(
			document,
			[
				{ x: 0, y: 0 },
				{ x: 0.5, y: 0.7 },
				{ x: 1, y: 1 },
			],
			"curve",
		);
		document.history.commit();
		const curved = renderer.outputImage();
		expect(curved).not.toBe(adjusted);
		expect(curved.size).toEqual(source.size);
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
		expect(document.scene.getState().layers[0].adjustments.exposure).toBe(0);
		document.history.redo();
		expect(renderer.inspect().passes).toEqual([
			"layer/base/adjustments",
			"layer/curve/curves",
		]);
		document.history.begin();
		setToneCurve(document, undefined, "curve");
		expect(renderer.outputImage()).toBe(adjusted);
		document.history.cancel();
		expect(renderer.inspect().passes).toEqual([
			"layer/base/adjustments",
			"layer/curve/curves",
		]);
		draw();
		expect(calls.createRenderPipeline).toBe(pipelines);
		expect(notify).toHaveBeenCalledTimes(8);
		expect(late).toHaveBeenCalledTimes(1);
		detach();
		const beforeInput = document.scene.getState();
		const base = beforeInput.layers[0];
		document.edit({
			...beforeInput,
			layers: [
				{
					...base,
					children: [
						{ ...createLayer("exposure"), id: "exposure" },
						...base.children,
					],
				},
			],
		});
		await renderer.update(document.scene.getState(), "curve");
		expect(renderer.inputImage("curve")).toBeDefined();
		expect(renderer.inputImage("curve")).not.toBe(renderer.outputImage());
		expect(renderer.inputImage("exposure")).toBeUndefined();
		expect(renderer.inspect().passes).toEqual([
			"layer/base/adjustments",
			"layer/exposure/exposure",
			"layer/curve/curves",
		]);
		setLayer(document, "curve", { visible: false });
		await renderer.update(document.scene.getState(), "curve");
		expect(renderer.inputImage("curve")).toBe(renderer.outputImage());
		document.edit(beforeInput);
		expect(renderer.inputImage("curve")).toBeUndefined();
		setAdjustments(document, { exposure: -1 });
		const scene = document.scene.getState();
		const [image, ...effects] = scene.layers;
		document.edit({
			...scene,
			layers: [
				image,
				{
					...createLayer("details"),
					details: { clarity: 50, sharpening: 100, sharpenRadius: 2 },
				},
				...effects,
			],
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
		const croppedOutput = renderer.outputImage();
		expect(croppedOutput.size).toEqual([16, 8]);
		renderer.dispose();
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
