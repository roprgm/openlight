import { node } from "@/core/render/node";
import type { Vignette } from "@/lib/editor/scene";
import shader from "./vignette.wgsl";

export function vignette(settings?: Vignette) {
	if (!settings || settings.intensity === 0) {
		return;
	}
	return node("vignette", shader, {
		set: { params: settings },
	});
}
