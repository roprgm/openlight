import type { Gpu, Target } from "vgpu";
import { create } from "zustand";
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

export type Source = { file: File; image?: Target; error?: string };
export type Scene = { source?: Source; adjustments: Adjustments };
type SceneStore = Scene & {
	loadImage: (gpu: Gpu, file: File) => Promise<void>;
	setAdjustments: (change: Partial<Adjustments>) => void;
};

export const useScene = create<SceneStore>((set, get) => ({
	adjustments: { ...defaultAdjustments },
	loadImage: async (gpu, file) => {
		if (!(file instanceof File)) {
			throw new Error("loadImage requires a File.");
		}
		const source = { file };
		get().source?.image?.color.dispose();
		set({ source, adjustments: { ...defaultAdjustments } });
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
}));
