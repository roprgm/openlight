import type { LinearGradient } from "@/core/document";
import { merge, node, type RenderImage } from "@/core/renderer/node";
import shader from "./mix.wgsl";

/** Interpolates an adjustment result without changing image coverage or HDR headroom. */
export function mixAdjustment(
	name: string,
	original: RenderImage,
	edited: RenderImage,
	opacity: number,
	mask?: LinearGradient,
) {
	if (original === edited || opacity === 0) {
		return original;
	}
	if (opacity === 1 && !mask) {
		return edited;
	}
	return merge(
		{ original, edited },
		node(name, shader, {
			set: {
				params: {
					opacity,
					masked: Number(!!mask),
					start: mask?.start ?? [0, 0],
					end: mask?.end ?? [1, 0],
				},
			},
		}),
	);
}
