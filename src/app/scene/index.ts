import type { Target } from "vgpu";
import { create } from "zustand";
import {
	defaultCurve,
	type ToneCurve,
	validateCurve,
} from "@/features/tone-curves/curve";

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

export type Source = { file: File; image?: Target; error?: string };
export type Scene = {
	source?: Source;
	adjustments: Adjustments;
	toneCurve: ToneCurve;
};
type SceneStore = Scene & {
	setAdjustments: (change: Partial<Adjustments>) => void;
	/** Ordered points in 0..1; endpoints follow the lower-left and upper-right edges. Omit to reset. */
	setToneCurve: (toneCurve?: ToneCurve) => void;
};

export const useScene = create<SceneStore>((set, get) => ({
	adjustments: { ...defaultAdjustments },
	toneCurve: defaultCurve,
	setAdjustments: (change) => {
		const { source, adjustments } = get();
		if (!source) {
			throw new Error("Load an image before changing adjustments.");
		}
		set({ adjustments: { ...adjustments, ...change } });
	},
	setToneCurve: (toneCurve = defaultCurve) => {
		if (!get().source) {
			throw new Error("Load an image before changing the tone curve.");
		}
		validateCurve(toneCurve);
		set({ toneCurve: toneCurve.map((point) => ({ ...point })) });
	},
}));
