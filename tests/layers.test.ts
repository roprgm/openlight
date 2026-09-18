import { expect, test } from "bun:test";
import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import { createControls } from "@/app/controls";
import { createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createWorkspace } from "@/app/workspace";
import {
	createDocument,
	createResources,
	findLayer,
	walkLayers,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { defaultAdjustments } from "@/features/adjustments/model";
import {
	addLayer,
	deleteLayer,
	duplicateLayer,
	moveLayer,
	setExposure,
	setLayer,
	setLayerMask,
} from "@/features/layers/edits";

test("nested layers compose in order, move atomically, and duplicate with independent IDs", async () => {
	const gpu = await init();
	const source = createImageSource(
		target(gpu, { size: [32, 16], format: "rgba16float" }),
	);
	const resources = createResources();
	const sourceId = resources.add(new File([], "photo.png"), source);
	const document = createDocument(
		{
			frame: imageFrame(source.image.size),
			layers: [
				{
					kind: "image",
					id: "base",
					name: "Photo",
					source: sourceId,
					adjustments: defaultAdjustments,
					children: [],
				},
			],
		},
		resources,
	);
	const workspace = createWorkspace();
	await workspace.open("photo.png", async () => document);
	const controls = createControls(gpu, workspace);
	const renderer = createEditorRenderer(gpu, source);
	try {
		const original = document.scene.getState();
		controls.beginEdit();
		controls.setAdjustments({ exposure: 1 });
		controls.setColorMixer("blue", { saturation: -20 });
		expect(() => controls.setToneCurve([])).toThrow();
		controls.cancelEdit();
		expect(document.scene.getState()).toEqual(original);
		expect(document.history.status.getState()).toEqual({
			undoCount: 0,
			redoCount: 0,
		});
		expect(document.selection.getState().layerId).toBe("base");
		controls.setVignette({ softness: 75 });
		expect(document.scene.getState().layers[1]).toMatchObject({
			vignette: { intensity: 0, softness: 75 },
		});
		controls.undo();
		controls.editScene({ frame: { ...original.frame, size: [8, 8] } });
		const defaultMask = controls.addLayer("mask");
		expect(
			findLayer(document.scene.getState().layers, defaultMask),
		).toMatchObject({ mask: { start: [6.4, 8], end: [25.6, 8] } });
		controls.undo();
		controls.undo();
		const mask = addLayer(document, createLayer("mask", [32, 16]));
		const exposure = addLayer(
			document,
			createLayer("exposure", [32, 16]),
			mask,
		);
		const vignette = addLayer(
			document,
			createLayer("vignette", [32, 16]),
			mask,
		);
		document.history.begin();
		setExposure(document, exposure, 2);
		setExposure(document, exposure, 3);
		document.selectLayer("base");
		document.history.undo();
		expect(findLayer(document.scene.getState().layers, exposure)).toMatchObject(
			{ exposure: 1 },
		);
		expect(document.selection.getState().layerId).toBe("base");
		await renderer.update(document.scene.getState());
		expect(renderer.inspect().passes).toEqual([
			"layer/base/adjustments",
			`layer/${exposure}/exposure`,
			`layer/${vignette}/vignette`,
			`layer/${mask}/mix`,
		]);
		const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
		const compiled = calls.createRenderPipeline;
		setLayer(document, mask, { visible: false });
		await renderer.update(document.scene.getState());
		expect(renderer.inspect().passes).toEqual(["layer/base/adjustments"]);
		setLayer(document, mask, { visible: true, opacity: 0.5 });
		await renderer.update(document.scene.getState());
		expect(calls.createRenderPipeline).toBe(compiled);
		const duplicate = duplicateLayer(document, mask);
		const copy = findLayer(document.scene.getState().layers, duplicate);
		expect(copy?.children.map((layer) => layer.kind)).toEqual([
			"exposure",
			"vignette",
		]);
		const ids = walkLayers(document.scene.getState().layers).map(
			(layer) => layer.id,
		);
		expect(new Set(ids).size).toBe(ids.length);
		moveLayer(document, exposure, 1);
		expect(document.scene.getState().layers[1].id).toBe(exposure);
		expect(
			findLayer(document.scene.getState().layers, mask)?.children.map(
				(layer) => layer.id,
			),
		).toEqual([vignette]);
		document.history.undo();
		expect(
			findLayer(document.scene.getState().layers, mask)?.children[0].id,
		).toBe(exposure);
		const unchanged = document.scene.getState();
		expect(() =>
			addLayer(document, createLayer("curves", [32, 16]), exposure),
		).toThrow("two levels");
		expect(() => moveLayer(document, mask, 0, exposure)).toThrow("itself");
		expect(() => moveLayer(document, exposure, 0)).toThrow("position");
		expect(() =>
			setLayerMask(document, mask, {
				kind: "linear",
				start: [0, 0],
				end: [0, 0],
			}),
		).toThrow("distinct");
		expect(() => setExposure(document, exposure, NaN)).toThrow("Exposure");
		expect(() => deleteLayer(document, "base")).toThrow("unavailable");
		expect(document.scene.getState()).toBe(unchanged);
		document.selectLayer(exposure);
		deleteLayer(document, mask);
		expect(document.selection.getState().layerId).toBe("base");
		expect(
			findLayer(document.scene.getState().layers, exposure),
		).toBeUndefined();
		document.history.undo();
		expect(findLayer(document.scene.getState().layers, exposure)).toBeDefined();
		expect(renderer.outputImage().format).toBe("rgba16float");
	} finally {
		renderer.dispose();
		workspace.dispose();
		gpu.dispose();
	}
});
