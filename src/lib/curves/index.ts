export type CurvePoint = { readonly x: number; readonly y: number };
export type Curve = readonly CurvePoint[];

/** One-sided PCHIP endpoint slope, limited to preserve the segment's shape. */
function endpointSlope(
	width: number,
	nextWidth: number,
	slope: number,
	nextSlope: number,
) {
	const tangent =
		((2 * width + nextWidth) * slope - width * nextSlope) / (width + nextWidth);
	if (Math.sign(tangent) !== Math.sign(slope)) {
		return 0;
	}
	if (
		Math.sign(slope) !== Math.sign(nextSlope) &&
		Math.abs(tangent) > 3 * Math.abs(slope)
	) {
		return 3 * slope;
	}
	return tangent;
}

/** Shape-preserving cubic interpolation of at least two points with strictly increasing x. */
export function interpolateCurve(points: Curve) {
	const widths = points.slice(1).map((point, i) => point.x - points[i].x);
	const slopes = widths.map(
		(width, i) => (points[i + 1].y - points[i].y) / width,
	);
	const last = slopes.length - 1;
	const tangents = points.map((_, i) => {
		if (last === 0) {
			return slopes[0];
		}
		if (i === 0) {
			return endpointSlope(widths[0], widths[1], slopes[0], slopes[1]);
		}
		if (i === points.length - 1) {
			return endpointSlope(
				widths[last],
				widths[last - 1],
				slopes[last],
				slopes[last - 1],
			);
		}
		const before = slopes[i - 1];
		const after = slopes[i];
		if (before * after <= 0) {
			return 0;
		}
		const leftWeight = 2 * widths[i] + widths[i - 1];
		const rightWeight = widths[i] + 2 * widths[i - 1];
		return (
			(leftWeight + rightWeight) / (leftWeight / before + rightWeight / after)
		);
	});
	return (x: number) => {
		if (x <= points[0].x) {
			return points[0].y;
		}
		if (x >= points[points.length - 1].x) {
			return points[points.length - 1].y;
		}
		let i = 0;
		while (x > points[i + 1].x) {
			i++;
		}
		const t = (x - points[i].x) / widths[i];
		const t2 = t * t;
		const t3 = t2 * t;
		return (
			(2 * t3 - 3 * t2 + 1) * points[i].y +
			(t3 - 2 * t2 + t) * widths[i] * tangents[i] +
			(3 * t2 - 2 * t3) * points[i + 1].y +
			(t3 - t2) * widths[i] * tangents[i + 1]
		);
	};
}

/** Uniform samples over 0..1, including both endpoints; size must be at least two. */
export function sampleCurve(points: Curve, size = 1024) {
	const evaluate = interpolateCurve(points);
	return Float32Array.from({ length: size }, (_, i) =>
		evaluate(i / (size - 1)),
	);
}
