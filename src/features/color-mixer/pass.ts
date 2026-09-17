import { effect, type Gpu, type Target, target } from "vgpu";
import type { SceneEffect } from "@/lib/editor/renderer";
import shader from "./mixer.wgsl";
import { colors, isNeutral } from "./model";

/** Each renderer owns its output and reuses the same mixer pipeline. */
export function createColorMixer(gpu: Gpu, source: Target): SceneEffect {
	let output: Target | undefined;
	const settings = gpu.device.createBuffer({
		size: colors.length * 4 * Float32Array.BYTES_PER_ELEMENT,
		usage: ["storage", "copy_dst"],
	});
	const apply = effect(gpu, shader, { set: { settings } });
	return {
		render(frame, input, scene) {
			const mixer = scene.colorMixer;
			if (!mixer || isNeutral(mixer)) {
				return input;
			}
			output ??= target(gpu, { size: source.size, format: source.format });
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
			frame.pass(output, apply.set({ source: input.color }));
			return output;
		},
		dispose() {
			output?.color.dispose();
			settings.dispose();
		},
	};
}
