import type { Gpu } from "vgpu";
import type { Scene } from "@/core/document";
import type { ImageSource } from "@/core/image";
import type { RenderImage } from "@/core/renderer";
import { denoiseBlend } from "./processing/blend";
import { createCachedDenoising } from "./processing/cache";

/** Owns this renderer's share of the source's filtered results. */
export function createNoiseReduction(gpu: Gpu, source: ImageSource) {
	const cache = createCachedDenoising(gpu, source);
	return {
		prepare(scene: Scene) {
			if ((scene.noiseReduction ?? 0) > 0) {
				return cache.prepare(scene.whiteBalance);
			}
		},
		apply(image: RenderImage, amount: number) {
			return denoiseBlend(image, cache.texture(), amount);
		},
		dispose: cache.dispose,
	};
}
