import { mat3, vec2, vec3 } from "gl-matrix";

type WhiteBalance = Readonly<Record<string, number>>;
type Calibration = {
	xyzToCamera: mat3;
	cfa: number[];
	balance: number[];
};

// Krystek 1985, doi:10.1002/col.5080100109. CIE 1960 uv, valid 1000–15000 K.
function locus(t: number) {
	return [
		(0.860117757 + 1.54118254e-4 * t + 1.28641212e-7 * t * t) /
			(1 + 8.42420235e-4 * t + 7.08145163e-7 * t * t),
		(0.317398726 + 4.22806245e-5 * t + 4.20481691e-8 * t * t) /
			(1 - 2.89741816e-5 * t + 1.61456053e-7 * t * t),
	];
}
function normal(t: number) {
	const [x, y] = vec2.subtract([], locus(t + 1), locus(t - 1));
	return vec2.normalize([], [y, -x]);
}
function whitePoint({ temperature, tint }: WhiteBalance) {
	const uv = locus(temperature),
		n = normal(temperature);
	// Positive tint corrects green illumination; one unit is 1/3000 in uv.
	const u = uv[0] + (n[0] * tint) / 3000,
		v = uv[1] + (n[1] * tint) / 3000;
	return [(1.5 * u) / v, 1, (4 - u - 10 * v) / (2 * v)];
}
function temperatureTint([x, y, z]: vec3): WhiteBalance {
	const denominator = x + 15 * y + 3 * z,
		u = (4 * x) / denominator,
		v = (6 * y) / denominator;
	const distance = (t: number) => vec2.squaredDistance(locus(t), [u, v]);
	let lo = 1000,
		hi = 15000;
	for (let i = 0; i < 40; i++) {
		const a = lo + (hi - lo) / 3,
			b = hi - (hi - lo) / 3;
		if (distance(a) < distance(b)) {
			hi = b;
		} else {
			lo = a;
		}
	}
	const temperature = (lo + hi) / 2,
		p = locus(temperature),
		n = normal(temperature);
	return {
		temperature: Math.round(temperature),
		tint: Math.round(3000 * ((u - p[0]) * n[0] + (v - p[1]) * n[1])) || 0,
	};
}
/** File gains remain authoritative; Kelvin/tint are an editable approximation of chromaticity. */
export function createWhiteBalance({ xyzToCamera, cfa, balance }: Calibration) {
	const cameraToXyz = mat3.invert([], xyzToCamera);
	if (!cameraToXyz) {
		return;
	}
	const neutral = [0, 1, 2].map((c) => 1 / balance[cfa.indexOf(c)]);
	const xyz = vec3.transformMat3([], neutral, cameraToXyz);
	const asShot = temperatureTint(xyz);
	if (
		![...xyz].every((v) => Number.isFinite(v) && v > 0) ||
		Math.abs(asShot.tint) > 150
	) {
		return;
	}
	const reference = vec3.transformMat3([], whitePoint(asShot), xyzToCamera);
	return {
		asShot,
		gains(value: WhiteBalance) {
			if (
				value.temperature === asShot.temperature &&
				value.tint === asShot.tint
			) {
				return balance;
			}
			const white = vec3.transformMat3([], whitePoint(value), xyzToCamera);
			// Anchor to exact file gains, including exposure scaling and both green sites.
			vec3.max(white, white, [1e-6, 1e-6, 1e-6]);
			const ratios = vec3.divide([], reference, white);
			// Bound extrapolation outside the camera gamut to eight stops of gain.
			return balance.map((v, i) =>
				Math.min(256, (v * ratios[cfa[i]]) / ratios[1]),
			);
		},
	};
}
