import { effect, type Gpu } from "vgpu";
import { type RenderImage, renderNode } from "@/engine/render-graph";
import type { ColorMixer } from "@/lib/editor/scene";
import shader from "./mixer.wgsl";
import { colors, isNeutral } from "./model";

export function createColorMixer(gpu: Gpu) {
	const settings = gpu.device.createBuffer({
		size: colors.length * 4 * Float32Array.BYTES_PER_ELEMENT,
		usage: ["storage", "copy_dst"],
	});
	const apply = effect(gpu, shader, { set: { settings } });
	return {
		render(input: RenderImage, mixer?: ColorMixer) {
			if (!mixer || isNeutral(mixer)) {
				return input;
			}
			return renderNode("color-mixer", [input], ([image]) => {
				settings.write(
					new Float32Array(
						colors.flatMap(({ angle }, index) => [
							mixer.hue[index],
							mixer.saturation[index],
							mixer.luminance[index],
							angle,
						]),
					),
				);
				return apply.set({ source: image.color });
			});
		},
		dispose() {
			settings.dispose();
		},
	};
}
