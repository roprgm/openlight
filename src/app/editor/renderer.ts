import type { Gpu, Timer } from "vgpu";
import { createRenderer } from "@/core/render/renderer";
import { colorMixer } from "@/features/color-mixer/pass";
import { vignette } from "@/features/vignette/pass";
import { adjustments } from "@/lib/adjustments";
import { transformImages } from "@/lib/image-frame";
import type { ImageSource } from "@/lib/image-source";
import { toneCurves } from "@/lib/tone-curves";
import { unsharpMask } from "@/lib/unsharp-mask";

/** The same graph composition powers the editing preview and export. */
export function createEditorRenderer(
	gpu: Gpu,
	source: ImageSource,
	clock?: Timer,
) {
	return createRenderer(
		gpu,
		source,
		(input, scene) => {
			const adjusted = adjustments(input, scene.adjustments);
			const curved = toneCurves(adjusted, scene.toneCurve);
			const colored = colorMixer(curved, scene.colorMixer);
			const vignetted = vignette(colored, scene.vignette);
			const clarified = unsharpMask(
				"clarity",
				vignetted,
				scene.adjustments.clarity / 200,
				64,
				16,
			);
			const full = unsharpMask(
				"sharpen",
				clarified,
				scene.adjustments.sharpening / 50,
				scene.adjustments.sharpenRadius,
			);
			const [original, beforeCurves, output] = transformImages(
				[source.image, adjusted, full],
				scene.frame,
			);
			return { original, input: beforeCurves, full, output };
		},
		clock,
	);
}
