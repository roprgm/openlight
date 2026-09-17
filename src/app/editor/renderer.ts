import type { Gpu, Timer } from "vgpu";
import { createColorMixer } from "@/features/color-mixer/pass";
import { createVignette } from "@/features/vignette/pass";
import { createAdjustments } from "@/lib/adjustments";
import { createRenderer } from "@/lib/editor/renderer";
import { createImageFrame } from "@/lib/image-frame";
import type { ImageSource } from "@/lib/image-source";
import { createToneCurves } from "@/lib/tone-curves";
import { createUnsharpMask } from "@/lib/unsharp-mask";

/** The same graph composition powers the editing preview and export. */
export function createEditorRenderer(
	gpu: Gpu,
	source: ImageSource,
	clock?: Timer,
) {
	const adjust = createAdjustments(gpu);
	const curves = createToneCurves(gpu);
	const mixer = createColorMixer(gpu);
	const vignette = createVignette(gpu);
	const clarity = createUnsharpMask(gpu, "clarity", 16);
	const sharpen = createUnsharpMask(gpu, "sharpen");
	const transform = createImageFrame(gpu);
	return createRenderer(
		gpu,
		source,
		{
			build(input, scene) {
				const adjusted = adjust(input, scene.adjustments);
				const curved = curves.render(adjusted, scene.toneCurve);
				const colored = mixer.render(curved, scene.colorMixer);
				const vignetted = vignette(colored, scene.vignette);
				const clarified = clarity(
					vignetted,
					scene.adjustments.clarity / 200,
					64,
				);
				const full = sharpen(
					clarified,
					scene.adjustments.sharpening / 50,
					scene.adjustments.sharpenRadius,
				);
				const [original, beforeCurves, output] = transform(
					[source.image, adjusted, full],
					scene.frame,
				);
				return { original, input: beforeCurves, full, output };
			},
			dispose() {
				curves.dispose();
				mixer.dispose();
			},
		},
		clock,
	);
}
