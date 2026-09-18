import type { Gpu, Timer } from "vgpu";
import type { ImageSource } from "@/core/image";
import {
	createRenderer,
	input,
	pipeline,
	transformImages,
} from "@/core/renderer";
import { adjustments } from "@/features/adjustments/pass";
import { unsharpMask } from "@/features/adjustments/unsharp-mask";
import { colorMixer } from "@/features/color-mixer/pass";
import { toneCurves } from "@/features/tone-curves/pass";
import { vignette } from "@/features/vignette/pass";

/** The same graph composition powers the editing preview and export. */
export function createEditorRenderer(
	gpu: Gpu,
	source: ImageSource,
	timer?: Timer,
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
		timer,
	);
}
