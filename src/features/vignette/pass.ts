import type { Vignette } from "@/core/document";
import { node } from "@/core/renderer";
import shader from "./vignette.wgsl";

export function vignette(settings?: Vignette, name = "vignette") {
	if (!settings || settings.intensity === 0) {
		return;
	}
	return node(name, shader, { set: { params: settings } });
}
