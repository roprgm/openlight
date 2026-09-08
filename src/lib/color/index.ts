export const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const xyzToWorking = [
	1.7166512, -0.3556708, -0.2533663, -0.6666844, 1.6164812, 0.0157685,
	0.0176399, -0.0427706, 0.9421031,
];
export const d65 = [0.95047, 1, 1.08883];
export const d50 = [0.96422, 1, 0.82521];
export const srgbToWorking = [
	0.627404, 0.329283, 0.043313, 0.069097, 0.91954, 0.011362, 0.016391, 0.088013,
	0.895595,
];

export function multiply(a: number[], b: number[]) {
	return Array.from({ length: b.length }, (_, i) => {
		const columns = b.length / 3,
			row = Math.floor(i / columns),
			column = i % columns;
		return (
			a[row * 3] * b[column] +
			a[row * 3 + 1] * b[column + columns] +
			a[row * 3 + 2] * b[column + 2 * columns]
		);
	});
}
export function inverse(m: number[]) {
	const [a, b, c, d, e, f, g, h, i] = m;
	const out = [
		e * i - f * h,
		c * h - b * i,
		b * f - c * e,
		f * g - d * i,
		a * i - c * g,
		c * d - a * f,
		d * h - e * g,
		b * g - a * h,
		a * e - b * d,
	];
	const det = a * out[0] + b * out[3] + c * out[6];
	if (!Number.isFinite(det) || Math.abs(det) < 1e-10) {
		throw new Error("Singular image color matrix.");
	}
	return out.map((v) => v / det);
}
export function diagonal(v: number[]) {
	return identity.map((x, i) => x * v[Math.floor(i / 3)]);
}

/** Bradford adaptation, applied once between the source white and the working D65 white. */
export function adaptation(white: number[], destination = d65) {
	const bradford = [
		0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296,
	];
	const source = multiply(bradford, white),
		target = multiply(bradford, destination);
	return multiply(
		multiply(inverse(bradford), diagonal(target.map((v, i) => v / source[i]))),
		bradford,
	);
}
