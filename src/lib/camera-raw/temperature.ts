import { temperatureRange, type WhiteBalance } from "@/lib/image-source";

export function xyzToUv([x, y, z]: readonly number[]) {
	const sum = x + 15 * y + 3 * z;
	return [(4 * x) / sum, (6 * y) / sum];
}

/** Kang et al. (2002), Planckian-locus polynomial, valid from 1667 to 25000 K. */
function locus(temperature: number) {
	const t = 1000 / temperature;
	const x =
		temperature <= 4000
			? -0.2661239 * t ** 3 - 0.234358 * t ** 2 + 0.8776956 * t + 0.17991
			: -3.0258469 * t ** 3 + 2.1070379 * t ** 2 + 0.2226347 * t + 0.24039;
	let coefficients = [3.081758, -5.8733867, 3.75112997, -0.37001483];
	if (temperature <= 2222)
		coefficients = [-1.1063814, -1.3481102, 2.18555832, -0.20219683];
	else if (temperature <= 4000)
		coefficients = [-0.9549476, -1.37418593, 2.09137015, -0.16748867];
	const [a, b, c, d] = coefficients;
	const y = ((a * x + b) * x + c) * x + d;
	return xyzToUv([x, y, 1 - x - y]);
}

function normal(temperature: number) {
	const before = locus(Math.max(1667, temperature - 1));
	const after = locus(Math.min(25000, temperature + 1));
	const du = after[0] - before[0];
	const dv = after[1] - before[1];
	const length = Math.hypot(du, dv);
	return [dv / length, -du / length];
}

export function whiteBalanceToXyz({ temperature, tint }: WhiteBalance) {
	const uv = locus(temperature);
	const direction = normal(temperature);
	const u = uv[0] + direction[0] * tint * 0.0001;
	const v = uv[1] + direction[1] * tint * 0.0001;
	return [(1.5 * u) / v, 1, (4 - u - 10 * v) / (2 * v)];
}

/** Find the closest point on the locus, then retain the perpendicular tint component. */
export function xyzToWhiteBalance(xyz: readonly number[]): WhiteBalance {
	const uv = xyzToUv(xyz);
	const distance = (mired: number) => {
		const point = locus(1e6 / mired);
		return (point[0] - uv[0]) ** 2 + (point[1] - uv[1]) ** 2;
	};
	let low = 1e6 / temperatureRange[1];
	let high = 1e6 / temperatureRange[0];
	for (let i = 0; i < 48; i++) {
		const a = low + (high - low) / 3;
		const b = high - (high - low) / 3;
		if (distance(a) < distance(b)) high = b;
		else low = a;
	}
	const temperature = 2e6 / (low + high);
	const point = locus(temperature);
	const direction = normal(temperature);
	const tint =
		((uv[0] - point[0]) * direction[0] + (uv[1] - point[1]) * direction[1]) *
		1e4;
	return { temperature, tint };
}
