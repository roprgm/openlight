import type { ToneCurve } from "@/features/tone-curves/curve";
import type { Adjustments } from "@/lib/adjustments";

export type { Adjustments } from "@/lib/adjustments";

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
};

export type ImageLayer = {
	readonly id: string;
	readonly name: string;
	readonly source: string;
	readonly visible: boolean;
	readonly opacity: number;
	readonly adjustments: Readonly<Adjustments>;
	readonly toneCurve: ToneCurve;
};

/** Serializable document content, ordered from bottom to top. */
export type Scene = {
	readonly size: readonly [number, number];
	readonly layers: readonly ImageLayer[];
};
