import type { Gpu, Timer } from "vgpu";
import type { EffectLayer, ImageLayer, Scene } from "@/core/document";
import type { ImageSource } from "@/core/image";
import {
	createRenderer,
	input,
	mixAdjustment,
	pipeline,
	type RenderImage,
	transformImages,
} from "@/core/renderer";
import { exposure } from "@/features/adjustments/exposure";
import { adjustments } from "@/features/adjustments/pass";
import { unsharpMask } from "@/features/adjustments/unsharp-mask";
import { colorMixer } from "@/features/color-mixer/pass";
import { toneCurves } from "@/features/tone-curves/pass";
import { vignette } from "@/features/vignette/pass";

function develop(image: RenderImage, layer: ImageLayer) {
	const name = `layer/${layer.id}`;
	const values = layer.adjustments;
	const adjusted = pipeline(image, [
		adjustments(values, `${name}/adjustments`),
	]);
	const output = pipeline(adjusted, [
		toneCurves(layer.toneCurve, `${name}/curves`),
		colorMixer(layer.colorMixer, `${name}/color-mixer`),
		unsharpMask(`${name}/clarity`, values.clarity / 200, 64, 16),
		unsharpMask(
			`${name}/sharpen`,
			values.sharpening / 50,
			values.sharpenRadius,
		),
	]);
	return { adjusted, output };
}

function composeLayer(below: RenderImage, layer: EffectLayer, scene: Scene) {
	if (!layer.visible || layer.opacity === 0) {
		return below;
	}
	const name = `layer/${layer.id}`;
	const effect =
		layer.kind === "exposure"
			? exposure(`${name}/exposure`, layer.exposure)
			: vignette(layer.vignette, `${name}/vignette`, scene.frame, below.size);
	const edited = pipeline(below, [effect]);
	return mixAdjustment(`${name}/mix`, below, edited, layer.opacity, layer.mask);
}

/** Pure layer composition shares the same graph for preview, crop, and export. */
export function createEditorRenderer(
	gpu: Gpu,
	source: ImageSource,
	timer?: Timer,
) {
	return createRenderer(
		gpu,
		source,
		(image, scene) => {
			const base = develop(image, scene.image);
			const full = scene.layers.reduce(
				(below, layer) => composeLayer(below, layer, scene),
				base.output,
			);
			const [original, beforeCurves, output] = transformImages(
				[input(source.image), base.adjusted, full],
				scene.frame,
			);
			return { original, input: beforeCurves, full, output };
		},
		timer,
	);
}
