import { mat3, vec3 } from "gl-matrix";
import type { WhiteBalance } from "@/lib/image-source";
import { whiteBalanceToXyz, xyzToWhiteBalance } from "./temperature";

export type Calibration = {
	temperature: number;
	color: number[];
	camera: number[];
};
export type WhiteBalanceProfile = {
	calibrations: Calibration[];
	analog: number[];
	neutral: number[];
	asShot: WhiteBalance;
};

// DNG CalibrationIlluminant / EXIF LightSource values with defined nominal temperatures.
const illuminants: Record<number, number> = {
	1: 5500,
	2: 4230,
	3: 2856,
	4: 5500,
	9: 5500,
	10: 6500,
	11: 7500,
	12: 6400,
	13: 5050,
	14: 4150,
	15: 3525,
	17: 2856,
	18: 4874,
	19: 6774,
	20: 5503,
	21: 6504,
	22: 7504,
	23: 5003,
	24: 3200,
};
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function interpolate(a: number[], b: number[], weight: number) {
	return mat3.transpose(
		mat3.create(),
		a.map((value, i) => value + (b[i] - value) * weight),
	);
}

/** DNG chapter 6: AnalogBalance × CameraCalibration × ColorMatrix, interpolated in reciprocal K. */
function xyzToCamera(profile: WhiteBalanceProfile, temperature: number) {
	const a = profile.calibrations[0];
	const b = profile.calibrations.at(-1) ?? a;
	const weight =
		a.temperature === b.temperature
			? 0
			: Math.max(
					0,
					Math.min(
						1,
						(1 / temperature - 1 / a.temperature) /
							(1 / b.temperature - 1 / a.temperature),
					),
				);
	const color = interpolate(a.color, b.color, weight);
	const camera = interpolate(a.camera, b.camera, weight);
	const result = mat3.multiply(mat3.create(), camera, color);
	for (let i = 0; i < 9; i++) result[i] *= profile.analog[i % 3];
	return result;
}

function cameraWhite(profile: WhiteBalanceProfile, balance: WhiteBalance) {
	const response = vec3.transformMat3(
		vec3.create(),
		whiteBalanceToXyz(balance),
		xyzToCamera(profile, balance.temperature),
	);
	const maximum = Math.max(...response);
	return [...response].map((value) => Math.max(0.001, value / maximum));
}

export function neutralForWhiteBalance(
	profile: WhiteBalanceProfile,
	balance: WhiteBalance,
) {
	// Preserve the exact recorded neutral at reset, including rounding and off-locus camera whites.
	// Anchor the conversion to it so the first slider movement cannot introduce a jump.
	const reference = cameraWhite(profile, profile.asShot);
	const selected = cameraWhite(profile, balance);
	return profile.neutral.map(
		(value, i) => value * (selected[i] / reference[i]),
	);
}

export function readWhiteBalance(
	numbers: (tag: number, fallback?: number[]) => number[],
	neutral: number[],
): WhiteBalanceProfile {
	const calibrations = [0, 1]
		.flatMap((i) => {
			const color = numbers(50721 + i);
			if (!color.length) return [];
			const camera = numbers(50723 + i, identity);
			if (
				color.length !== 9 ||
				camera.length !== 9 ||
				![...color, ...camera].every(Number.isFinite)
			)
				throw Error("Invalid DNG white-balance calibration.");
			return [
				{
					color,
					camera,
					temperature: illuminants[numbers(50778 + i, [0])[0]] ?? 6504,
				},
			];
		})
		.sort((a, b) => a.temperature - b.temperature);
	if (!calibrations.length) throw Error("DNG has no color matrix.");
	const analog = numbers(50727, [1, 1, 1]);
	if (analog.length !== 3 || analog.some((v) => !Number.isFinite(v) || v <= 0))
		throw Error("Invalid DNG analog balance.");
	const profile = {
		calibrations,
		analog,
		neutral,
		asShot: { temperature: 6504, tint: 0 },
	};
	const xy = numbers(50729);
	if (
		xy.length &&
		(xy.length !== 2 ||
			xy.some((v) => !Number.isFinite(v) || v <= 0) ||
			xy[0] + xy[1] >= 1)
	)
		throw Error("Invalid DNG as-shot white point.");
	for (let i = 0; i < 30; i++) {
		const inverse = mat3.invert(
			mat3.create(),
			xyzToCamera(profile, profile.asShot.temperature),
		);
		if (!inverse) throw Error("DNG white-balance matrix is singular.");
		const xyz = xy.length
			? [xy[0] / xy[1], 1, (1 - xy[0] - xy[1]) / xy[1]]
			: vec3.transformMat3(vec3.create(), neutral, inverse);
		if (![...xyz].every(Number.isFinite) || xyz[1] <= 0)
			throw Error("Invalid DNG white point.");
		const next = xyzToWhiteBalance([...xyz]);
		const difference = Math.abs(next.temperature - profile.asShot.temperature);
		profile.asShot = next;
		if (difference < 0.01) break;
	}
	if (xy.length) profile.neutral = cameraWhite(profile, profile.asShot);
	profile.asShot = {
		temperature: Math.round(profile.asShot.temperature),
		tint: Math.round(profile.asShot.tint * 10) / 10,
	};
	return profile;
}
