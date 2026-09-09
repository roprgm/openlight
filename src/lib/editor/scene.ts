import type { Adjustments as ToneAdjustments } from "@/lib/adjustments";
import type { ImageFrame } from "@/lib/image-frame/geometry";
import type { ToneCurve } from "@/lib/tone-curves/curve";
import type { WhiteBalance } from "@/lib/white-balance";

export type Adjustments = ToneAdjustments & {
	clarity: number;
	sharpening: number;
	sharpenRadius: number;
};

export const defaultAdjustments: Adjustments = {
	exposure: 0,
	incrementalTemperature: 0,
	incrementalTint: 0,
	contrast: 0,
	highlights: 0,
	shadows: 0,
	whites: 0,
	blacks: 0,
	vibrance: 0,
	saturation: 0,
	clarity: 0,
	sharpening: 0,
	sharpenRadius: 1,
};

export const adjustmentLimits: Adjustments = {
	exposure: 5,
	incrementalTemperature: 100,
	incrementalTint: 100,
	contrast: 100,
	highlights: 100,
	shadows: 100,
	whites: 100,
	blacks: 100,
	vibrance: 100,
	saturation: 100,
	clarity: 100,
	sharpening: 150,
	sharpenRadius: 3,
};

export const adjustmentMinimums: Partial<Adjustments> = {
	sharpening: 0,
	sharpenRadius: 0.5,
};

/** Serializable document content. Image bytes and GPU resources live elsewhere. */
export type Scene = {
	readonly frame: ImageFrame;
	readonly source: string;
	readonly whiteBalance?: Readonly<WhiteBalance>;
	readonly adjustments: Readonly<Adjustments>;
	readonly toneCurve: ToneCurve;
};
