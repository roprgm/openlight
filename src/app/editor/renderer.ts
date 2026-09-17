import type { Gpu, Timer } from "vgpu";
import { input, pipeline } from "@/core/render/node";
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
		(image, scene) => {
			const adjusted = pipeline(image, [adjustments(scene.adjustments)]);
			const full = pipeline(adjusted, [
				toneCurves(scene.toneCurve),
				colorMixer(scene.colorMixer),
				vignette(scene.vignette),
				unsharpMask("clarity", scene.adjustments.clarity / 200, 64, 16),
				unsharpMask(
					"sharpen",
					scene.adjustments.sharpening / 50,
					scene.adjustments.sharpenRadius,
				),
			]);
			const [original, beforeCurves, output] = transformImages(
				[input(source.image), adjusted, full],
				scene.frame,
			);
			return { original, input: beforeCurves, full, output };
		},
		clock,
	);
}
