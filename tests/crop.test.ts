import { expect, test } from "bun:test";
import {
	fitRatio,
	flip,
	move,
	resize,
	rotate,
	turn,
} from "@/features/crop/geometry";
import {
	frameTransform,
	type ImageFrame,
	imageFrame,
	type Point,
	validateFrame,
} from "@/lib/image-frame/geometry";

const source: Point = [1200, 800];
function sample(frame: ImageFrame, x: number, y: number) {
	const { origin, xAxis, yAxis } = frameTransform(frame, source);
	return origin.map((value, axis) => value + x * xAxis[axis] + y * yAxis[axis]);
}
function expectCovered(frame: ImageFrame) {
	for (const x of [0, 1]) {
		for (const y of [0, 1]) {
			for (const value of sample(frame, x, y)) {
				expect(value).toBeGreaterThanOrEqual(-1e-9);
				expect(value).toBeLessThanOrEqual(1 + 1e-9);
			}
		}
	}
}

test("crop preserves source coverage, opposite anchors, flips, and sliding along edges", () => {
	const edge: ImageFrame = {
		...imageFrame(source),
		center: [900, 400],
		size: [600, 400],
	};
	expect(move(edge, 120, 80, source).center).toEqual([900, 480]);
	const minimum = resize(imageFrame(source), "se", -1200, -800, null, source);
	for (const ratio of [16 / 9, 9 / 16, 4 / 3, 3 / 4, 1]) {
		const next = fitRatio(minimum, ratio);
		expect(() => validateFrame(next)).not.toThrow();
		expect(next.size[0] / next.size[1]).toBeCloseTo(ratio, 10);
		expect(next.center).toEqual(minimum.center);
		expectCovered(next);
	}
	for (const rotation of [0, 90, 180, 270]) {
		for (const angle of [-45, -30, 0, 30, 45]) {
			const before = rotate(
				{ ...edge, center: [480, 360], rotation },
				angle,
				source,
			);
			for (const axis of [0, 1]) {
				const flipped = flip(before, axis);
				expectCovered(flipped);
				for (const x of [0, 0.3, 1]) {
					for (const y of [0, 0.7, 1]) {
						const expected = sample(
							before,
							axis === 0 ? 1 - x : x,
							axis === 1 ? 1 - y : y,
						);
						for (const [i, value] of sample(flipped, x, y).entries()) {
							expect(value).toBeCloseTo(expected[i], 10);
						}
					}
				}
				for (const direction of [-1, 1]) {
					const turned = turn(flipped, direction);
					expectCovered(turned);
					expect(turn(turned, -direction)).toEqual(flipped);
				}
				for (const [handle, x, y] of [
					["nw", 1, 1],
					["ne", 0, 1],
					["sw", 1, 0],
					["se", 0, 0],
					["n", 0.5, 1],
					["s", 0.5, 0],
					["w", 1, 0.5],
					["e", 0, 0.5],
				] as const) {
					for (const delta of [-1200, 1200]) {
						for (const ratio of [before.size[0] / before.size[1], null]) {
							const next = resize(flipped, handle, delta, delta, ratio, source);
							expectCovered(next);
							if (ratio)
								expect(next.size[0] / next.size[1]).toBeCloseTo(ratio, 8);
							if (!ratio && x === 0.5)
								expect(next.size[0]).toBe(flipped.size[0]);
							if (!ratio && y === 0.5)
								expect(next.size[1]).toBe(flipped.size[1]);
							const anchor = sample(flipped, x, y);
							for (const [i, value] of sample(next, x, y).entries()) {
								expect(value).toBeCloseTo(anchor[i], 8);
							}
							expect(next.scale).toBe(flipped.scale);
							expectCovered(move(next, delta, delta, source));
							expectCovered(rotate(next, -angle, source));
						}
					}
				}
			}
		}
	}
});
