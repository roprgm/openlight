import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createDocument } from "@/app/document";
import {
	createImageLayer,
	removeLayer,
	setAdjustments,
	setLayer,
	setToneCurve,
} from "@/app/document/edits";
import { createResources } from "@/app/document/resources";
import { createWorkspace } from "@/app/workspace";
import { defaultCurve } from "@/features/tone-curves/curve";

function document() {
	return createDocument({
		size: [32, 32],
		layers: [createImageLayer("image-1", "Image")],
	});
}

test("documents edit independently without React, retain bounded history, and reject edits after replacement", async () => {
	const first = document();
	const second = document();
	setAdjustments(first, { exposure: 1 });
	const points = [
		{ x: 0, y: 0 },
		{ x: 0.5, y: 0.7 },
		{ x: 1, y: 1 },
	];
	setToneCurve(first, points);
	points[1].y = 0.2;
	expect(first.scene.getState().layers[0].toneCurve[1].y).toBe(0.7);
	expect(second.scene.getState().layers[0].adjustments.exposure).toBe(0);
	expect(second.history.status.getState().undoCount).toBe(0);
	const unchanged = first.scene.getState();
	for (const curve of [
		[],
		[{ x: 0, y: 0 }],
		[
			{ x: 0, y: 0 },
			{ x: 0, y: 1 },
		],
		[
			{ x: 0, y: 0 },
			{ x: 1 / 2048, y: 1 },
		],
		[
			{ x: 0, y: 0 },
			{ x: 0.8, y: 0.5 },
			{ x: 0.5, y: 1 },
		],
		[
			{ x: 0, y: 0 },
			{ x: 1, y: Number.NaN },
		],
		[
			{ x: 0, y: -1 },
			{ x: 1, y: 1 },
		],
		[
			{ x: 0.1, y: 0.1 },
			{ x: 1, y: 1 },
		],
		[
			{ x: 0, y: 0 },
			{ x: 0.9, y: 0.9 },
		],
	]) {
		expect(() => setToneCurve(first, curve)).toThrow();
	}
	expect(first.scene.getState()).toBe(unchanged);
	first.history.undo();
	expect(first.scene.getState().layers[0].toneCurve).toEqual(defaultCurve);
	for (let i = 0; i < 150; i++) setAdjustments(first, { exposure: i % 2 });
	expect(first.history.status.getState().undoCount).toBe(100);
	for (let i = 0; i < 100; i++) first.history.undo();
	expect(first.history.status.getState()).toEqual({
		undoCount: 0,
		redoCount: 100,
	});
	setAdjustments(first, { contrast: 10 });
	expect(first.history.status.getState()).toEqual({
		undoCount: 1,
		redoCount: 0,
	});
	const workspace = createWorkspace();
	await workspace.open("first", async () => first);
	const stale = document();
	let release = () => {};
	const pending = new Promise<typeof stale>((resolve) => {
		release = () => resolve(stale);
	});
	const loading = workspace.open("slow", () => pending);
	await workspace.open("second", async () => second);
	release();
	await loading;
	expect(() => setAdjustments(stale, { exposure: 2 })).toThrow("closed");
	expect(workspace.getDocument()).toBe(second);
	expect(() => setAdjustments(first, { exposure: 2 })).toThrow("closed");
	workspace.dispose();
	expect(() => setAdjustments(second, { exposure: 2 })).toThrow("closed");

	// Sources stay alive while any layer or history snapshot references them.
	const gpu = await init();
	const resources = createResources();
	const file = new File(["fixture"], "image.png");
	const add = () => resources.add(file, target(gpu, { size: [2, 2] }));
	const source = add();
	const layer = createImageLayer(source, "First");
	const doc = createDocument({ size: [2, 2], layers: [layer] }, resources);
	const extraSource = add();
	const extra = createImageLayer(extraSource, "Second");
	doc.history.begin();
	doc.edit({ ...doc.scene.getState(), layers: [layer, extra] });
	doc.history.cancel();
	expect(() => resources.get(extraSource)).toThrow("unavailable");
	removeLayer(doc, layer.id);
	expect(resources.get(source)).toBeDefined();
	doc.history.undo();
	expect(doc.selection.getState().layerId).toBe(layer.id);
	expect(resources.get(source)).toBeDefined();
	const branchSource = add();
	const branch = createImageLayer(branchSource, "Branch");
	doc.edit({ ...doc.scene.getState(), layers: [layer, branch] });
	doc.history.undo();
	setLayer(doc, layer.id, { name: "Renamed" });
	expect(() => resources.get(branchSource)).toThrow("unavailable");
	// A source shared by two layers remains alive until both leave retained history.
	const duplicate = createImageLayer(source, "Duplicate");
	doc.edit({ ...doc.scene.getState(), layers: [layer, duplicate] });
	removeLayer(doc, layer.id);
	doc.history.clear();
	expect(resources.get(source)).toBeDefined();
	const replacementSource = add();
	const replacement = createImageLayer(replacementSource, "Replacement");
	doc.edit({ ...doc.scene.getState(), layers: [replacement] });
	for (let i = 0; i < 100; i++) {
		setLayer(doc, replacement.id, { name: String(i) });
	}
	expect(() => resources.get(source)).toThrow("unavailable");
	expect(resources.get(replacementSource)).toBeDefined();
	doc.dispose();
	expect(() => resources.get(replacementSource)).toThrow("unavailable");
	gpu.dispose();
});
