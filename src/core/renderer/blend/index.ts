import type { LinearGradient } from "@/core/document";
import { merge, node, type RenderImage } from "@/core/renderer/node";
import shader from "./mix.wgsl";

type MaskModifier = {
	readonly mask: LinearGradient;
	readonly opacity: number;
	readonly operation: "add" | "subtract";
};
const emptyModifiers = new Float32Array(8);

function modifierData(modifiers: readonly MaskModifier[]) {
	if (!modifiers.length) {
		return emptyModifiers;
	}
	const data = new Float32Array(modifiers.length * 8);
	modifiers.forEach(({ mask, opacity, operation }, index) => {
		data.set(
			[...mask.start, ...mask.end, operation === "add" ? opacity : -opacity],
			index * 8,
		);
	});
	return data;
}

/** Interpolates an adjustment result without changing image coverage or HDR headroom. */
export function mixAdjustment(
	name: string,
	original: RenderImage,
	edited: RenderImage,
	opacity: number,
	mask?: LinearGradient,
	modifiers: readonly MaskModifier[] = [],
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
			storage: { modifiers: modifierData(modifiers) },
			set: {
				params: {
					opacity,
					masked: Number(!!mask),
					modifierCount: modifiers.length,
					start: mask?.start ?? [0, 0],
					end: mask?.end ?? [1, 0],
				},
			},
		}),
	);
}
