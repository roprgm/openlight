import type { Gpu, Target } from "vgpu";
import { create } from "zustand";
import type { Curve } from "@/lib/curves";
import decode from "@/lib/decode";

/** Non-destructive edits: exposure in stops, the rest -100..100. */
export type Adjustments = {
	exposure: number;
	temp: number;
	tint: number;
	contrast: number;
	vibrance: number;
	saturation: number;
};

export const defaultAdjustments: Adjustments = {
	exposure: 0,
	temp: 0,
	tint: 0,
	contrast: 0,
	vibrance: 0,
	saturation: 0,
};

export const adjustmentLimits: Adjustments = {
	exposure: 5,
	temp: 100,
	tint: 100,
	contrast: 100,
	vibrance: 100,
	saturation: 100,
};

export const defaultCurve: Curve = [
	{ x: 0, y: 0 },
	{ x: 1, y: 1 },
];

export type Source = { file: File; image?: Target; error?: string };
export type Scene = { source?: Source; adjustments: Adjustments; curve: Curve };
type SceneStore = Scene & {
	loadImage: (gpu: Gpu, file: File) => Promise<void>;
	setAdjustments: (change: Partial<Adjustments>) => void;
	/** Ordered points in 0..1; endpoints follow the lower-left and upper-right edges. Omit to reset. */
	setCurve: (curve?: Curve) => void;
};

export const useScene = create<SceneStore>((set, get) => ({
	adjustments: { ...defaultAdjustments },
	curve: defaultCurve,
	loadImage: async (gpu, file) => {
		if (!(file instanceof File)) {
			throw new Error("loadImage requires a File.");
		}
		const source = { file };
		get().source?.image?.color.dispose();
		set({
			source,
			adjustments: { ...defaultAdjustments },
			curve: defaultCurve,
		});
		try {
			const image = await decode(gpu, file);
			if (get().source !== source) {
				image.color.dispose();
				return;
			}
			set({ source: { file, image } });
		} catch (error) {
			if (get().source === source) {
				set({ source: { file, error: String(error) } });
			}
		}
	},
	setAdjustments: (change) => {
		const { source, adjustments } = get();
		if (!source) {
			throw new Error("Load an image before changing adjustments.");
		}
		set({ adjustments: { ...adjustments, ...change } });
	},
	setCurve: (curve = defaultCurve) => {
		if (!get().source) {
			throw new Error("Load an image before changing the curve.");
		}
		set({ curve: curve.map((point) => ({ ...point })) });
	},
}));
