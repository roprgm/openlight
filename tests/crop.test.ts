import { expect, test } from "bun:test";
import {
	changeGeometry,
	cropTransform,
	defaultGeometry,
	flipCrop,
	type Geometry,
	moveCrop,
	resizeCrop,
} from "@/features/crop/geometry";

function sample(
	geometry: Geometry,
	size: readonly [number, number],
	x: number,
	y: number,
) {
	const { origin, xAxis, yAxis } = cropTransform(geometry, size);
	return origin.map((v, i) => v + x * xAxis[i] + y * yAxis[i]);
}

function expectCovered(geometry: Geometry, size: readonly [number, number]) {
	for (const x of [0, 1]) {
		for (const y of [0, 1]) {
			for (const value of sample(geometry, size, x, y)) {
				expect(value).toBeGreaterThanOrEqual(-1e-9);
				expect(value).toBeLessThanOrEqual(1 + 1e-9);
			}
		}
	}
}

test("crop geometry preserves coverage, anchors, flips, and movement along edges", () => {
	const size = [1200, 800] as const;
	const edge = {
		...defaultGeometry,
		x: 0.5,
		y: 0.25,
		width: 0.5,
		height: 0.5,
	};
	const slide = moveCrop(edge, 0.1, 0.1, size);
	expect(slide.x).toBeCloseTo(0.5);
	expect(slide.y).toBeCloseTo(0.35);
	for (const rotation of [0, 90, 180, 270]) {
		for (const angle of [-45, -30, 30, 45]) {
			const before = changeGeometry(
				defaultGeometry,
				{
					x: 0.15,
					y: 0.2,
					width: 0.5,
					height: 0.5,
					rotation,
					angle,
					flipX: rotation % 180 !== 0,
					flipY: angle < 0,
				},
				size,
			);
			for (const axis of ["horizontal", "vertical"] as const) {
				const flipped = flipCrop(before, axis);
				expectCovered(flipped, size);

				for (const x of [0, 0.3, 1]) {
					for (const y of [0, 0.7, 1]) {
						const u = axis === "horizontal" ? 1 - x : x;
						const v = axis === "vertical" ? 1 - y : y;
						const expected = sample(before, size, u, v);
						for (const [i, value] of sample(flipped, size, x, y).entries()) {
							expect(value).toBeCloseTo(expected[i], 10);
						}
					}
				}
			}
			for (const handle of ["nw", "ne", "sw", "se", "move"]) {
				for (const delta of [-1, 1]) {
					const ratio = delta < 0 ? before.width / before.height : null;
					const next =
						handle === "move"
							? moveCrop(before, delta, delta, size)
							: resizeCrop(before, handle, delta, delta, ratio, size);
					expectCovered(next, size);
					if (ratio && handle !== "move") {
						expect(next.width / next.height).toBeCloseTo(ratio, 8);
						const right = handle.includes("w") ? 1 : 0;
						const bottom = handle.includes("n") ? 1 : 0;
						const anchor = sample(before, size, right, bottom);
						for (const [i, value] of sample(
							next,
							size,
							right,
							bottom,
						).entries()) {
							expect(value).toBeCloseTo(anchor[i], 8);
						}
					}
					expect(next.scale).toBe(before.scale);
					expectCovered(changeGeometry(next, { angle: -angle }, size), size);
				}
			}
		}
	}
});
