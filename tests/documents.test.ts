import { expect, test } from "@playwright/test";
import { createDocument } from "@/app/document";
import { setAdjustments, setToneCurve } from "@/app/document/edits";
import { defaultAdjustments } from "@/app/scene";
import { createWorkspace } from "@/app/workspace";
import { defaultCurve } from "@/features/tone-curves/curve";

function document() {
	return createDocument({
		size: [32, 32],
		source: "image-1",
		adjustments: { ...defaultAdjustments },
		toneCurve: defaultCurve,
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
	expect(first.scene.getState().toneCurve[1].y).toBe(0.7);
	expect(second.scene.getState().adjustments.exposure).toBe(0);
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
	expect(first.scene.getState().toneCurve).toEqual(defaultCurve);
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
});
