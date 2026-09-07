import { frame, type Gpu, type Target } from "vgpu";
import { createAdjustments } from "@/lib/adjustments";
import type { Scene } from "@/lib/editor/scene";
import { createImageFrame } from "@/lib/image-frame";
import { createToneCurves } from "@/lib/tone-curves";
import { createUnsharpMask } from "@/lib/unsharp-mask";

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(gpu: Gpu, source: Target) {
	const adjust = createAdjustments(gpu, source);
	const adjusted = adjust.output;
	const toneCurves = createToneCurves(gpu, adjusted);
	const clarity = createUnsharpMask(gpu, source, 16);
	const sharpen = createUnsharpMask(gpu, source);

	const transform = createImageFrame(gpu);
	let original = source;
	let input = adjusted;
	let fullImage = adjusted;
	const listeners = new Set<() => void>();
	let rendered = false;
	let output = adjusted;
	return {
		originalImage: () => original,
		inputImage: () => input,
		fullImage: () => fullImage,
		outputImage: () => output,
		subscribe(listener: () => void) {
			listeners.add(listener);
			if (rendered) {
				listener();
			}
			return () => {
				listeners.delete(listener);
			};
		},
		update(scene: Scene) {
			frame(gpu, (frame) => {
				adjust.render(frame, scene.adjustments);
				const curved = toneCurves.render(frame, scene.toneCurve);
				const {
					clarity: amount,
					sharpening,
					sharpenRadius,
				} = scene.adjustments;
				const clarified = clarity.render(frame, curved, amount / 200, 64);
				fullImage = sharpen.render(
					frame,
					clarified,
					sharpening / 100,
					sharpenRadius,
				);
				[original, input, output] = transform.render(
					frame,
					[source, adjusted, fullImage],
					scene.frame,
				);
			});
			rendered = true;
			for (const listener of listeners) {
				listener();
			}
		},
		dispose() {
			listeners.clear();
			adjust.dispose();
			toneCurves.dispose();
			clarity.dispose();
			sharpen.dispose();
			transform.dispose();
		},
	};
}
