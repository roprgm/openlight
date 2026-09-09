import type { WhiteBalance } from "@/lib/image-source";

export function whiteBalanceLimits(asShot: WhiteBalance) {
	return {
		temperature: {
			min: Math.min(2000, asShot.temperature),
			max: Math.max(25000, asShot.temperature),
		},
		tint: {
			min: Math.min(-150, asShot.tint),
			max: Math.max(150, asShot.tint),
		},
	};
}

export function validateWhiteBalance(
	balance: WhiteBalance,
	asShot: WhiteBalance | undefined,
) {
	if (!asShot) {
		throw Error("Invalid RAW white balance.");
	}
	const limits = whiteBalanceLimits(asShot);
	for (const channel of ["temperature", "tint"] as const) {
		const value = balance[channel];
		const { min, max } = limits[channel];
		if (!Number.isFinite(value) || value < min || value > max) {
			throw Error("Invalid RAW white balance.");
		}
	}
}
