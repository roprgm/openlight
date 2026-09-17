import type { ColorMixer } from "@/core/document";
import { node } from "@/core/renderer";
import shader from "./mixer.wgsl";
import { colors, isNeutral } from "./model";

export function colorMixer(mixer?: ColorMixer) {
	if (!mixer || isNeutral(mixer)) {
		return;
	}
	return node("color-mixer", shader, {
		storage: {
			settings: new Float32Array(
				colors.flatMap(({ angle }, index) => [
					mixer.hue[index],
					mixer.saturation[index],
					mixer.luminance[index],
					angle,
				]),
			),
		},
	});
}
