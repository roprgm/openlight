import type { WhiteBalance } from "@/core/image";
import type { ImageFrame, Point } from "@/core/image/frame";

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

/** Frame-centered darkening in 0..100 UI units. */
export type Vignette = {
	readonly intensity: number;
	readonly softness: number;
};

export type ImageLayer = {
	readonly id: string;
	readonly source: string;
	readonly whiteBalance?: Readonly<WhiteBalance>;
	readonly adjustments: Readonly<Adjustments>;
	readonly toneCurve: ToneCurve;
	readonly colorMixer?: ColorMixer;
};

/** Endpoints in the original document canvas, independent of crop and rotation. */
export type LinearGradient = { readonly start: Point; readonly end: Point };
export type EffectLayer = {
	readonly id: string;
	readonly name: string;
	readonly visible: boolean;
	readonly opacity: number;
	readonly mask?: LinearGradient;
} & (
	| { readonly kind: "exposure"; readonly exposure: number }
	| { readonly kind: "vignette"; readonly vignette: Vignette }
);

/** The image is pinned below the ordered effect layers. Resources stay outside history. */
export type Scene = {
	readonly frame: ImageFrame;
	readonly image: ImageLayer;
	readonly layers: readonly EffectLayer[];
};
