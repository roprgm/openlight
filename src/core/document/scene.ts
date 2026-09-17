import type { WhiteBalance } from "@/core/image";
import type { ImageFrame } from "@/core/image/frame";

export type Adjustments = {
	exposure: number;
	incrementalTemperature: number;
	incrementalTint: number;
	contrast: number;
	highlights: number;
	shadows: number;
	whites: number;
	blacks: number;
	vibrance: number;
	saturation: number;
	clarity: number;
	sharpening: number;
	sharpenRadius: number;
};

export type CurvePoint = { readonly x: number; readonly y: number };
export type ToneCurve = readonly CurvePoint[];

/** Eight color ranges, ordered red through magenta; values use -100..100 UI units. */
export type ColorMixer = {
	readonly hue: readonly number[];
	readonly saturation: readonly number[];
	readonly luminance: readonly number[];
};

/** Source-centered darkening in 0..100 UI units. */
export type Vignette = {
	readonly intensity: number;
	readonly softness: number;
};

/** Serializable document content. Image bytes and GPU resources live elsewhere. */
export type Scene = {
	readonly frame: ImageFrame;
	readonly source: string;
	readonly whiteBalance?: Readonly<WhiteBalance>;
	readonly adjustments: Readonly<Adjustments>;
	readonly toneCurve: ToneCurve;
	readonly colorMixer?: ColorMixer;
	readonly vignette?: Vignette;
};
