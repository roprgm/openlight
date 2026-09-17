import { effect, type Gpu } from "vgpu";
import { type RenderImage, renderNode } from "@/engine/render-graph";
import type { Vignette } from "@/lib/editor/scene";
import shader from "./vignette.wgsl";

export function createVignette(gpu: Gpu) {
	const apply = effect(gpu, shader);
	return (input: RenderImage, vignette?: Vignette) => {
		if (!vignette || vignette.intensity === 0) {
			return input;
		}
		return renderNode("vignette", [input], ([image]) =>
			apply.set({ source: image.color, params: vignette }),
		);
	};
}
