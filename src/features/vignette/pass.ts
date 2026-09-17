import { type RenderImage, renderNode } from "@/core/render/node";
import type { Vignette } from "@/lib/editor/scene";
import shader from "./vignette.wgsl";

export function vignette(input: RenderImage, settings?: Vignette) {
	if (!settings || settings.intensity === 0) {
		return input;
	}
	return renderNode("vignette", shader, {
		inputs: { source: input },
		set: { params: settings },
	});
}
