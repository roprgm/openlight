import type { Gpu, Timer } from "vgpu";
import type { MaskLayer, ProcessingLayer } from "@/core/document";
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
import { defaultAdjustments } from "@/features/adjustments/model";
import { adjustments } from "@/features/adjustments/pass";
import { colorMixer } from "@/features/color-mixer/pass";
import { unsharpMask } from "@/features/details/unsharp-mask";
import { toneCurves } from "@/features/tone-curves/pass";
import { vignette } from "@/features/vignette/pass";

function maskAdjustments(layer: MaskLayer) {
	const name = `layer/${layer.id}`;
	const values = layer.adjustments;
	const hasOtherAdjustments = Object.entries(values).some(
		([key, value]) =>
			key !== "exposure" && value !== Reflect.get(defaultAdjustments, key),
	);
	if (hasOtherAdjustments) {
		return adjustments(values, `${name}/adjustments`);
	}
	return exposure(`${name}/exposure`, values.exposure);
}

type Composition = {
	image: RenderImage;
	input?: RenderImage;
};

function composeLayer(
	below: RenderImage,
	layer: ProcessingLayer,
	inputId?: string,
): Composition {
	let input = layer.id === inputId ? below : undefined;
	if (!layer.visible || layer.opacity === 0) {
		return { image: below, input };
	}
	const name = `layer/${layer.id}`;
	let edited = below;
	switch (layer.kind) {
		case "details":
			edited = pipeline(below, [
				unsharpMask(`${name}/clarity`, layer.details.clarity / 200, 64, 16),
				unsharpMask(
					`${name}/sharpen`,
					layer.details.sharpening / 50,
					layer.details.sharpenRadius,
				),
			]);
			break;
		case "mask":
			edited = pipeline(below, [maskAdjustments(layer)]);
			break;
		case "exposure":
			edited = pipeline(below, [exposure(`${name}/exposure`, layer.exposure)]);
			break;
		case "vignette":
			edited = pipeline(below, [vignette(layer.vignette, `${name}/vignette`)]);
			break;
		case "curves":
			edited = pipeline(below, [toneCurves(layer.toneCurve, `${name}/curves`)]);
			break;
		case "color-mixer":
			edited = pipeline(below, [
				colorMixer(layer.colorMixer, `${name}/color-mixer`),
			]);
			break;
	}
	const masks: MaskLayer[] = [];
	for (const child of layer.children) {
		if (layer.kind === "mask" && child.kind === "mask") {
			if (child.visible && child.opacity > 0) {
				masks.push(child);
			}
		} else {
			const childComposition = composeLayer(edited, child, inputId);
			edited = childComposition.image;
			input ??= childComposition.input;
		}
	}

	return {
		image: mixAdjustment(
			`${name}/mix`,
			below,
			edited,
			layer.opacity,
			layer.kind === "mask" ? layer.mask : undefined,
			masks,
		),
		input,
	};
}

function composeLayers(
	below: RenderImage,
	layers: readonly ProcessingLayer[],
	inputId?: string,
): Composition {
	let image = below;
	let input: RenderImage | undefined;
	for (const layer of layers) {
		const composition = composeLayer(image, layer, inputId);
		image = composition.image;
		input ??= composition.input;
	}
	return { image, input };
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
		(image, scene, inputId) => {
			const [sourceLayer, ...layers] = scene.layers;
			const base = pipeline(image, [
				adjustments(
					sourceLayer.adjustments,
					`layer/${sourceLayer.id}/adjustments`,
				),
			]);
			const children = composeLayers(base, sourceLayer.children, inputId);
			const composition = composeLayers(children.image, layers, inputId);
			const full = composition.image;
			const [original, output] = transformImages(
				[input(source.image), full],
				scene.frame,
			);
			return {
				original,
				full,
				output,
				input: children.input ?? composition.input,
			};
		},
		timer,
	);
}
