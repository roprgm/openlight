import { expect, test } from "@playwright/test";
import { sampleCurve } from "@/features/tone-curves/curve";
import { interpolatePchip } from "@/lib/math";

test("the diagonal samples to identity, including black and white", () => {
	const points = [
		{ x: 0, y: 0 },
		{ x: 1, y: 1 },
	];
	const samples = sampleCurve(points, 257);
	expect(samples).toBeInstanceOf(Float32Array);
	for (let i = 0; i < samples.length; i++) {
		expect(samples[i]).toBeCloseTo(i / 256, 7);
	}
});

test("a midtone lift interpolates the handles with a smooth cubic", () => {
	const evaluate = interpolatePchip([
		{ x: 0, y: 0 },
		{ x: 0.5, y: 0.75 },
		{ x: 1, y: 1 },
	]);
	expect(evaluate(0.25)).toBeCloseTo(0.453125, 7);
	expect(evaluate(0.5)).toBe(0.75);
	expect(evaluate(0.75)).toBeCloseTo(0.921875, 7);
	expect(evaluate(-1)).toBe(0);
	expect(evaluate(2)).toBe(1);
	const leftSlope = (evaluate(0.5) - evaluate(0.5 - 0.00001)) / 0.00001;
	const rightSlope = (evaluate(0.5 + 0.00001) - evaluate(0.5)) / 0.00001;
	expect(leftSlope).toBeCloseTo(rightSlope, 3);
});

test("unevenly spaced points, plateaus, and reversals do not overshoot", () => {
	const points = [
		{ x: 0, y: 0 },
		{ x: 0.02, y: 0.4 },
		{ x: 0.3, y: 0.4 },
		{ x: 0.7, y: 0.2 },
		{ x: 0.99, y: 0.95 },
		{ x: 1, y: 1 },
	];
	const evaluate = interpolatePchip(points);
	for (let i = 0; i < points.length - 1; i++) {
		const start = points[i];
		const end = points[i + 1];
		expect(evaluate(start.x)).toBeCloseTo(start.y, 10);
		let previous = start.y;
		for (let step = 1; step <= 100; step++) {
			const value = evaluate(start.x + ((end.x - start.x) * step) / 100);
			expect(value).toBeGreaterThanOrEqual(Math.min(start.y, end.y) - 1e-12);
			expect(value).toBeLessThanOrEqual(Math.max(start.y, end.y) + 1e-12);
			expect(
				(value - previous) * Math.sign(end.y - start.y),
			).toBeGreaterThanOrEqual(-1e-12);
			previous = value;
		}
	}
});
