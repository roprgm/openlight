import { effect, type Gpu, type Target, target } from "vgpu";
import type { SceneEffect } from "@/lib/editor/renderer";
import shader from "./vignette.wgsl";

export function createVignette(gpu: Gpu, source: Target): SceneEffect {
	const apply = effect(gpu, shader);
	let output: Target | undefined;
	return {
		render(frame, input, scene) {
			const vignette = scene.vignette;
			if (!vignette || vignette.intensity === 0) {
				return input;
			}
			output ??= target(gpu, { size: source.size, format: source.format });
			frame.pass(output, apply.set({ source: input.color, params: vignette }));
			return output;
		},
		dispose() {
			output?.color.dispose();
		},
	};
}
