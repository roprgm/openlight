import type { Vignette } from "@/core/document";
import {
	frameTransform,
	type ImageFrame,
	imageFrame,
} from "@/core/image/frame";
import { node } from "@/core/renderer";
import shader from "./vignette.wgsl";

export function vignette(
	settings?: Vignette,
	name = "vignette",
	frame?: ImageFrame,
	size: readonly number[] = [1, 1],
) {
	if (!settings || settings.intensity === 0) {
		return;
	}
	return node(name, shader, {
		set: {
			params: settings,
			transform: frameTransform(frame ?? imageFrame(size), size),
		},
	});
}
