import type { Gpu } from "vgpu";
import type { SceneEffect } from "@/lib/editor/renderer";
import type { ImageSource } from "@/lib/image-source";
import { createDenoiseBlend } from "./processing/blend";
import { createCachedDenoising } from "./processing/cache";

/** Owns this renderer's blend and its share of the source's filtered results. */
export function createNoiseReduction(
	gpu: Gpu,
	source: ImageSource,
): SceneEffect {
	const cache = createCachedDenoising(gpu, source);
	const blend = createDenoiseBlend(gpu, source.image, cache);
	return {
		prepare(scene) {
			if ((scene.noiseReduction ?? 0) > 0) {
				return cache.prepare(scene.whiteBalance);
			}
		},
		render(frame, input, scene) {
			return blend.render(frame, scene.noiseReduction ?? 0, input);
		},
		dispose() {
			blend.dispose();
			cache.dispose();
		},
	};
}
