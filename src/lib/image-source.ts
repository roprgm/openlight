import type { Frame, Gpu, Target } from "vgpu";

/** Kelvin plus a green–magenta offset: one tint unit is 0.0001 in CIE 1960 uv. */
export type WhiteBalance = { temperature: number; tint: number };
export const temperatureRange = [2000, 25000] as const;
export const tintRange = [-150, 150] as const;

export function validateWhiteBalance(
	value: WhiteBalance,
	asShot?: WhiteBalance,
) {
	const within = (n: number, range: readonly number[], original?: number) =>
		Number.isFinite(n) &&
		n >= Math.min(range[0], original ?? range[0]) &&
		n <= Math.max(range[1], original ?? range[1]);
	if (
		!within(value.temperature, temperatureRange, asShot?.temperature) ||
		!within(value.tint, tintRange, asShot?.tint)
	)
		throw Error("Invalid white balance.");
}

/** A loader supplies this capability only when its pixels support absolute white balance. */
export type WhiteBalanceSource = {
	asShot: Readonly<WhiteBalance>;
	/** Each renderer owns its stage; preview and export never share mutable output textures. */
	create(gpu: Gpu): {
		render(frame: Frame, balance?: Readonly<WhiteBalance>): Target;
		dispose(): void;
	};
	/** Release additional source resources; the document owns image.color separately. */
	dispose(): void;
};

export type ImageSource = { image: Target; whiteBalance?: WhiteBalanceSource };
