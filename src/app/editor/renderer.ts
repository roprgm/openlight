import type { Gpu, Timer } from "vgpu";
import { maskModifiers, type ProcessingLayer } from "@/core/document";
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
import { colorMixer } from "@/features/color-mixer/pass";
import { unsharpMask } from "@/features/details/unsharp-mask";
import { toneCurves } from "@/features/tone-curves/pass";
import { vignette } from "@/features/vignette/pass";

type Composition = {
  image: RenderImage;
  input?: RenderImage;
};

function composeLayer(
  below: RenderImage,
  layer: ProcessingLayer,
  inputId?: string,
): Composition {
  if (!layer.visible || layer.opacity === 0) {
    return { image: below };
  }
  const name = `layer/${layer.id}`;
  let input: RenderImage | undefined;
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
    case "mask": {
      const adjusted = pipeline(below, [adjustments(layer.adjustments, name)]);
      if (layer.id === inputId) {
        input = adjusted;
      }
      edited = pipeline(adjusted, [
        toneCurves(layer.toneCurve, `${name}/curves`),
      ]);
      break;
    }
    case "exposure":
      edited = pipeline(below, [exposure(`${name}/exposure`, layer.exposure)]);
      break;
    case "vignette":
      edited = pipeline(below, [vignette(layer.vignette, `${name}/vignette`)]);
      break;
    case "color-mixer":
      edited = pipeline(below, [
        colorMixer(layer.colorMixer, `${name}/color-mixer`),
      ]);
      break;
  }
  // Child masks of a mask shape its coverage; every other child processes the image.
  const masks = layer.kind === "mask" ? maskModifiers(layer) : [];
  const effects =
    layer.kind === "mask"
      ? layer.children.filter((child) => child.kind !== "mask")
      : layer.children;
  const children = composeLayers(edited, effects, inputId);
  return {
    image: mixAdjustment(
      `${name}/mix`,
      below,
      children.image,
      layer.opacity,
      layer.kind === "mask" ? layer.mask : undefined,
      masks,
    ),
    input: input ?? children.input,
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

/**
 * Pure layer composition shares the same graph for preview, crop, and export.
 * Layers process the source; the image layer's adjustments and curve then tone the composite,
 * so a local exposure still sees the light a global exposure would push past white.
 */
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
      const name = `layer/${sourceLayer.id}`;
      const children = composeLayers(image, sourceLayer.children, inputId);
      const composition = composeLayers(children.image, layers, inputId);
      const adjusted = pipeline(composition.image, [
        adjustments(sourceLayer.adjustments, name),
      ]);
      const full = pipeline(adjusted, [
        toneCurves(sourceLayer.toneCurve, `${name}/curves`),
      ]);
      const [original, output] = transformImages(
        [input(source.image), full],
        scene.frame,
      );
      return {
        original,
        full,
        output,
        input:
          inputId === sourceLayer.id
            ? adjusted
            : (children.input ?? composition.input),
      };
    },
    timer,
  );
}
