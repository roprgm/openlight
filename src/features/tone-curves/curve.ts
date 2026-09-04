import { clamp, interpolatePchip } from "@/lib/math";

export type CurvePoint = { readonly x: number; readonly y: number };
export type Curve = readonly CurvePoint[];

export const defaultCurve: Curve = [
	{ x: 0, y: 0 },
	{ x: 1, y: 1 },
];

const gap = 1 / 1024;

export function validateCurve(points: Curve) {
	if (!Array.isArray(points) || points.length < 2) {
		throw new Error("A curve needs at least two points.");
	}
	for (const [index, point] of points.entries()) {
		if (
			!point ||
			!Number.isFinite(point.x) ||
			!Number.isFinite(point.y) ||
			point.x < 0 ||
			point.x > 1 ||
			point.y < 0 ||
			point.y > 1
		) {
			throw new Error(
				"Curve coordinates must be finite numbers between 0 and 1.",
			);
		}
		if (index > 0 && point.x < points[index - 1].x + gap) {
			throw new Error(
				"Curve points must be ordered with a minimum x gap of 1/1024.",
			);
		}
	}
	const first = points[0];
	const last = points[points.length - 1];
	if ((first.x !== 0 && first.y !== 0) || (last.x !== 1 && last.y !== 1)) {
		throw new Error(
			"Curve endpoints must follow the lower-left and upper-right edges.",
		);
	}
}

export function moveCurvePoint(
	points: Curve,
	index: number,
	point: CurvePoint,
): Curve {
	if (!points[index]) {
		return points;
	}
	let x = clamp(point.x);
	let y = clamp(point.y);
	if (index === 0) {
		x = Math.min(x, points[1].x - gap);
		if (x < y) {
			x = 0;
		} else {
			y = 0;
		}
	} else if (index === points.length - 1) {
		x = Math.max(x, points[index - 1].x + gap);
		if (x > y) {
			x = 1;
		} else {
			y = 1;
		}
	} else {
		x = clamp(x, points[index - 1].x + gap, points[index + 1].x - gap);
	}
	return points.with(index, { x, y });
}

export function removeCurvePoint(points: Curve, index: number): Curve {
	if (index <= 0 || index >= points.length - 1) {
		return points;
	}
	return points.toSpliced(index, 1);
}

/** Uniform samples over 0..1, including both endpoints; size must be at least two. */
export function sampleCurve(points: Curve, size = 1024) {
	const evaluate = interpolatePchip(points);
	return Float32Array.from({ length: size }, (_, i) =>
		evaluate(i / (size - 1)),
	);
}

function midpoint(points: Curve): CurvePoint {
	let widest = 0;
	for (let i = 1; i < points.length - 1; i++) {
		if (
			points[i + 1].x - points[i].x >
			points[widest + 1].x - points[widest].x
		) {
			widest = i;
		}
	}
	const x = (points[widest].x + points[widest + 1].x) / 2;
	return { x, y: interpolatePchip(points)(x) };
}

/** Without a position, insert on the curve in its widest interval. */
export function insertCurvePoint(points: Curve, point = midpoint(points)) {
	const index = points.findIndex((next) => next.x > point.x);
	if (
		index <= 0 ||
		point.x - points[index - 1].x < gap ||
		points[index].x - point.x < gap
	) {
		return null;
	}
	return { curve: points.toSpliced(index, 0, point), index };
}
