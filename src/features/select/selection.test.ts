import { expect, test } from "bun:test";
import { createDocument } from "@/lib/editor/document";
import { defaultAdjustments } from "@/lib/editor/scene";
import { imageFrame } from "@/lib/image-frame/geometry";
import { defaultCurve } from "@/lib/tone-curves/curve";
import {
	type Affinity,
	defaultOptions,
	neighborCost,
	sampleSeed,
} from "./cost";
import { createSelectionEngine } from "./engine";
import fixture from "./fixture.wgsl";
import { grow } from "./grow";
import { getSelection } from "./session";

function mask(field: Affinity, seed: number, contiguous = true) {
	const steps = grow(field, seed, { ...defaultOptions, contiguous });
	let result = steps.next();
	while (!result.done) result = steps.next();
	return result.value;
}

test("a smooth sky gradient fills, while a color and structure boundary blocks the same grow", () => {
	const width = 96;
	const height = 32;
	const lab = new Float32Array(width * height * 4);
	const edge = new Float32Array(width * height).fill(0.0005);
	for (let i = 0; i < width * height; i++)
		lab.set(
			[0.55 + ((i % width) / width) * 0.12, -0.03, -0.08, 0.00001],
			i * 4,
		);
	const field = { width, height, lab, edge };
	expect(mask(field, width * 16 + 8).every((n) => n === 1)).toBe(true);
	for (let i = 0; i < width * height; i++) {
		if (i % width < 48) continue;
		lab.set([0.5, 0.12, 0.1, 0.08], i * 4);
		edge[i] = 0.18;
	}
	expect(neighborCost(field, 47, 48)).toBeGreaterThan(defaultOptions.tolerance);
	const selected = mask(field, width * 16 + 8);
	for (let i = 0; i < selected.length; i++)
		expect(selected[i]).toBe(Number(i % width < 48));
	// Texture alone separates a similarly colored shirt from sky.
	for (let i = 0; i < width * height; i++) {
		if (i % width < 48) continue;
		lab.set([0.61, -0.03, -0.08, 0.08], i * 4);
		edge[i] = 0.0005;
	}
	expect(mask(field, width * 16 + 8)[width * 16 + 60]).toBe(0);
	expect(mask(field, width * 16 + 8, false)[width * 16 + 60]).toBe(1);
});

test("exact grow takes a cheap connected detour and does not jump a closed barrier", () => {
	const width = 7;
	const height = 5;
	const field = {
		width,
		height,
		lab: new Float32Array(width * height * 4),
		edge: new Float32Array(width * height),
	};
	for (let i = 0; i < width * height; i++) field.lab.set([0.6, 0, 0, 0], i * 4);
	for (let y = 0; y < height - 1; y++) field.lab[y * width * 4 + 3 * 4] = 1.5;
	expect(mask(field, width * 2 + 1)[width * 2 + 5]).toBe(1);
	field.lab[(height - 1) * width * 4 + 3 * 4] = 1.5;
	expect(mask(field, width * 2 + 1)[width * 2 + 5]).toBe(0);
	expect(mask(field, width * 2 + 1, false)[width * 2 + 5]).toBe(1);
	expect(sampleSeed(field, 0, 5)[0]).toBeCloseTo(0.6);
});

test("selection resources are lazy, document-owned, and independent of history", async () => {
	const { init, target } = await import("vgpu/mock");
	const gpu = await init();
	const image = target(gpu, { size: [8, 8], format: "rgba16float" });
	const document = createDocument({
		frame: imageFrame([8, 8]),
		source: "photo",
		adjustments: defaultAdjustments,
		toneCurve: defaultCurve,
	});
	const selection = getSelection(gpu, document);
	expect(selection.engine()).toBeUndefined();
	selection.enter();
	await selection.prepare(image);
	const output = selection.engine()?.mask();
	expect(output).toBeDefined();
	selection.configure({ tolerance: 0.5, sampleSize: 5 });
	selection.begin([4, 4]);
	selection.escape();
	expect(document.history.status.getState().undoCount).toBe(0);
	expect(document.scene.getState()).not.toHaveProperty("selection");
	const pending = selection.selectAt([4, 4]);
	document.dispose();
	await pending;
	expect(() => output?.color.view).toThrow("destroyed");
	image.color.dispose();
	gpu.dispose();
});

test.skipIf(!process.env.GPU)(
	"GPU preview and exact grow share the edited linear affinity and soft mask algebra",
	async () => {
		const { init, target, frame, effect } = await import("vgpu/node");
		const gpu = await init();
		const image = target(gpu, { size: [48, 24], format: "rgba16float" });
		const engine = createSelectionEngine(gpu);
		try {
			frame(gpu, (f) => f.pass(image, effect(gpu, fixture)));
			await engine.prepare(image);
			engine.begin([8, 12], defaultOptions, "replace");
			for (let i = 0; i < 4; i++) frame(gpu, (f) => engine.preview(f));
			const preview = await engine.mask().readFloats();
			expect(preview[12 * 48 + 8]).toBe(1);
			expect(preview[12 * 48 + 36]).toBe(0);
			const committed = await engine.commit();
			expect(committed?.count).toBeGreaterThan(400);
			expect(committed?.count).toBeLessThan(600);
			const exact = await engine.mask().readFloats();
			expect(Array.from(exact)).toEqual(Array.from(preview));
			expect(exact.some((n) => n > 0 && n < 1)).toBe(true);
			engine.begin([36, 12], defaultOptions, "add");
			expect((await engine.commit())?.count).toBeGreaterThan(900);
			engine.begin([36, 12], defaultOptions, "subtract");
			await engine.commit();
			expect((await engine.mask().readFloats())[12 * 48 + 36]).toBe(0);
			engine.begin([36, 12], defaultOptions, "intersect");
			expect((await engine.commit())?.count).toBe(0);
			engine.begin([8, 12], defaultOptions, "replace");
			const pending = engine.commit();
			engine.cancel();
			expect(await pending).toBeNull();
		} finally {
			engine.dispose();
			image.color.dispose();
			gpu.dispose();
		}
	},
);
