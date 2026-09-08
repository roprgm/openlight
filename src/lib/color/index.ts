import { mat3, type ReadonlyVec3, vec3 } from "gl-matrix";

// Column-major, matching gl-matrix and WGSL uniforms.
export const xyzToWorking = [
	1.7166512, -0.6666844, 0.0176399, -0.3556708, 1.6164812, -0.0427706,
	-0.2533663, 0.0157685, 0.9421031,
];
export const d65 = [0.95047, 1, 1.08883];
export const d50 = [0.96422, 1, 0.82521];
export const srgbToWorking = [
	0.627404, 0.069097, 0.016391, 0.329283, 0.91954, 0.088013, 0.043313, 0.011362,
	0.895595,
];

/** Bradford adaptation, applied once between the source white and the working D65 white. */
export function adaptation(white: ReadonlyVec3) {
	const bradford = [
		0.8951, -0.7502, 0.0389, 0.2664, 1.7135, -0.0685, -0.1614, 0.0367, 1.0296,
	];
	const source = vec3.transformMat3([], white, bradford);
	const target = vec3.transformMat3([], d65, bradford);
	const scale = vec3.divide([], target, source);
	const adapted = bradford.map((v, i) => v * scale[i % 3]);
	const inverse: number[] = [];
	mat3.invert(inverse, bradford);
	mat3.multiply(adapted, inverse, adapted);
	return adapted;
}
