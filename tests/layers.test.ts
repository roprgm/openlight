import { expect, test } from "bun:test";
import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument } from "@/core/document";
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
import { defaultCurve } from "@/features/tone-curves/curve";

test("layers compose in order, reuse bypassed passes, and keep selection outside atomic history", async () => {
	const gpu = await init();
	const source = createImageSource(
		target(gpu, { size: [32, 16], format: "rgba16float" }),
	);
	const document = createDocument({
		frame: imageFrame(source.image.size),
		image: {
			id: "base",
			source: "image",
			adjustments: defaultAdjustments,
			toneCurve: defaultCurve,
		},
		layers: [],
	});
	const renderer = createEditorRenderer(gpu, source);
	try {
		const id = addLayer(document, "exposure", { start: [0, 0], end: [32, 0] });
		expect(document.selection.getState().layerId).toBe(id);
		setLayer(document, id, { opacity: 1 });
		setLayerMask(document, id, { end: [32, 0], start: [0, 0] });
		expect(document.history.status.getState().undoCount).toBe(1);
		expect(() => setLayer(document, id, { opacity: undefined })).toThrow(
			"Invalid",
		);
		document.history.begin();
		setExposure(document, id, 2);
		setExposure(document, id, 3);
		document.selectLayer("base");
		expect(document.history.status.getState().undoCount).toBe(2);
		document.history.undo();
		expect(document.scene.getState().layers[0]).toMatchObject({ exposure: 1 });
		expect(document.selection.getState().layerId).toBe("base");
		const duplicate = duplicateLayer(document, id);
		const vignette = addLayer(document, "vignette");
		moveLayer(document, vignette, 0);
		await renderer.update(document.scene.getState());
		expect(renderer.inspect().passes).toEqual([
			"layer/base/adjustments",
			`layer/${vignette}/vignette`,
			`layer/${id}/exposure`,
			`layer/${id}/mix`,
			`layer/${duplicate}/exposure`,
			`layer/${duplicate}/mix`,
		]);
		const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
		const compiled = calls.createRenderPipeline;
		setLayer(document, id, { visible: false });
		await renderer.update(document.scene.getState());
		expect(renderer.inspect().passes).not.toContain(`layer/${id}/mix`);
		setLayer(document, id, { visible: true, opacity: 0.5 });
		await renderer.update(document.scene.getState());
		expect(calls.createRenderPipeline).toBe(compiled);
		expect(renderer.outputImage().format).toBe("rgba16float");
		expect(() =>
			setLayerMask(document, id, { start: [0, 0], end: [0, 0] }),
		).toThrow("distinct");
		expect(() => setExposure(document, id, NaN)).toThrow("Exposure");
		expect(() => deleteLayer(document, "base")).toThrow("unavailable");
		document.selectLayer(id);
		deleteLayer(document, id);
		expect(document.selection.getState().layerId).toBe("base");
		await renderer.update(document.scene.getState());
		expect(renderer.inspect().passes).not.toContain(`layer/${id}/exposure`);
		document.history.undo();
		await renderer.update(document.scene.getState());
		expect(renderer.inspect().passes).toContain(`layer/${id}/exposure`);
		document.history.redo();
		expect(document.selection.getState().layerId).toBe("base");
	} finally {
		renderer.dispose();
		document.dispose();
		source.dispose();
		gpu.dispose();
	}
});
