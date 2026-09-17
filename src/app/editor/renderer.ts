import type { Gpu, Target } from "vgpu";
import { createColorMixer } from "@/features/color-mixer/pass";
import { createVignette } from "@/features/vignette/pass";
import { createRenderer, type SceneEffect } from "@/lib/editor/renderer";
import type { ImageSource } from "@/lib/image-source";

function createEffects(gpu: Gpu, source: Target): SceneEffect {
	const mixer = createColorMixer(gpu, source);
	const vignette = createVignette(gpu, source);
	return {
		render(frame, input, scene) {
			const colored = mixer.render(frame, input, scene);
			return vignette.render(frame, colored, scene);
		},
		dispose() {
			mixer.dispose();
			vignette.dispose();
		},
	};
}

/** The same feature composition powers the editing preview and export. */
export function createEditorRenderer(gpu: Gpu, source: ImageSource) {
	return createRenderer(gpu, source, createEffects);
}
