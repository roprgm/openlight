import { mat3 } from "gl-matrix";

function invert(m: mat3) {
	const inverted = mat3.invert(mat3.create(), m);
	if (!inverted) {
		throw new Error("DNG color matrix is singular.");
	}
	return inverted;
}

const xyzToRec2020 = mat3.fromValues(
	1.7166512,
	-0.6666844,
	0.0176399,
	-0.3556708,
	1.6164812,
	-0.0427706,
	-0.2533663,
	0.0157685,
	0.9421031,
);

/** Camera RGB to the working primaries, using the daylight calibration when present. */
export function cameraMatrix(
	numbers: (tag: number, fallback?: number[]) => number[],
) {
	// Two matrices come with their illuminants; daylight (21) matches the working white.
	const colorMatrix = [50721, 50722];
	const illuminant = [50778, 50779];
	const daylight = 21;
	const candidates = colorMatrix
		.map((tag, i) => ({
			matrix: numbers(tag),
			illuminant: numbers(illuminant[i], [0])[0],
		}))
		.filter((c) => c.matrix.length === 9);
	const chosen =
		candidates.find((c) => c.illuminant === daylight) ?? candidates.at(-1);
	if (!chosen) {
		throw new Error("DNG has no color matrix.");
	}
	// The file gives XYZ to camera, row-major. Camera to Rec.2020 is its inverse through XYZ, with each
	// row scaled to sum to one so the camera's balanced white stays white.
	const xyzToCamera = mat3.transpose(
		mat3.create(),
		Float32Array.from(chosen.matrix),
	);
	const matrix = [
		...mat3.multiply(mat3.create(), xyzToRec2020, invert(xyzToCamera)),
	];
	for (let r = 0; r < 3; r++) {
		const sum = matrix[r] + matrix[r + 3] + matrix[r + 6];
		for (const c of [r, r + 3, r + 6]) matrix[c] /= sum;
	}

	return matrix;
}
