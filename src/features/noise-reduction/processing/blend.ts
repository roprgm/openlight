import type { Target } from "vgpu";
import { input, merge, node, type RenderImage } from "@/core/renderer";
import shader from "./blend.wgsl";

/** The graph owns the blend output; the feature cache owns the filtered image. */
export function denoiseBlend(
	source: RenderImage,
	filtered: Target | undefined,
	amount: number,
): RenderImage {
	if (amount === 0) {
		return source;
	}
	if (!filtered) {
		throw Error("Prepare noise reduction before rendering it.");
	}
	if ("target" in source && source.target === filtered) {
		return source;
	}
	return merge(
		{ source, filtered: input(filtered) },
		node("noise-reduction", shader, { set: { amount: amount / 100 } }),
	);
}
