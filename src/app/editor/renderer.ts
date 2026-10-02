import type { Gpu, Timer } from "vgpu";
import { maskModifiers, type ProcessingLayer } from "@/core/document";
import type { ImageSource } from "@/core/image";
import {
  type Composition,
  createRenderer,
  input,
  maskInput,
  mixAdjustment,
  pipeline,
  type RenderImage,
  transformImages,
} from "@/core/renderer";
import { exposure } from "@/features/adjustments/exposure";
import { adjustments } from "@/features/adjustments/pass";
import { colorMixer } from "@/features/color-mixer/pass";
import { unsharpMask } from "@/features/details/unsharp-mask";
import { fill } from "@/features/fill/pass";
import { grain } from "@/features/grain/pass";
import { heal } from "@/features/heal/pass";
import { lut } from "@/features/lut/pass";
import { paint } from "@/features/paint/pass";
import { toneCurves } from "@/features/tone-curves/pass";
import { vignette } from "@/features/vignette/pass";

type Branch = {
  image: RenderImage;
  input?: RenderImage;
  rangeSource?: RenderImage;
};

function composeLayer(
  below: RenderImage,
  layer: ProcessingLayer,
  composition: Composition,
): Branch {
  const name = `layer/${layer.id}`;
  composition.retain(name);
  // A hidden or transparent layer still shows what its curve receives while it is inspected.
  const bypassed = !layer.visible || layer.opacity === 0;
  const inspected =
    layer.id === composition.inputId ||
    (layer.kind === "heal" &&
      layer.patches.some((patch) => patch.id === composition.inputId));
  // A mask's ranges read the image below it, hidden or not.
  const rangeSource =
    layer.id === composition.rangeSourceId ? below : undefined;
  const masks = layer.kind === "mask" ? maskModifiers(layer) : [];
  const coverage =
    layer.kind === "mask" ? composition.coverage(layer, below) : undefined;
  // Masks under a hidden effect still preview and pick the processed image they select when shown.
  const holdsMasks =
    layer.kind !== "mask" &&
    layer.children.some((child) => child.kind === "mask");
  if (bypassed && !inspected && !holdsMasks) {
    return { image: below, rangeSource };
  }
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
      if (layer.id === composition.inputId) {
        input = maskInput(name, adjusted, layer.mask, masks, coverage);
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
    case "grain":
      edited = pipeline(below, [grain(layer.grain, `${name}/grain`)]);
      break;
    case "color-mixer":
      edited = pipeline(below, [
        colorMixer(layer.colorMixer, `${name}/color-mixer`),
      ]);
      break;
    case "fill":
      edited = pipeline(below, [fill(layer.fill, `${name}/fill`)]);
      break;
    case "lut":
      edited = pipeline(below, [lut(layer.lut, `${name}/lut`)]);
      break;
    case "paint":
      edited = paint(
        below,
        composition.paint(layer),
        layer.blend,
        `${name}/paint`,
      );
      break;
    case "heal": {
      const result = heal(below, layer.patches, name, composition);
      edited = result.image;
      input = result.input;
      break;
    }
  }
  // Child masks of a mask shape its coverage; every other child processes the image.
  const effects =
    layer.kind === "mask"
      ? layer.children.filter((child) => child.kind !== "mask")
      : layer.children;
  const children = composeLayers(edited, effects, composition);
  const image = mixAdjustment(
    name,
    below,
    children.image,
    bypassed ? 0 : layer.opacity,
    layer.kind === "mask" ? layer.mask : undefined,
    masks,
    coverage,
  );
  return {
    image,
    input: input ?? children.input,
    rangeSource: rangeSource ?? children.rangeSource,
  };
}

function composeLayers(
  below: RenderImage,
  layers: readonly ProcessingLayer[],
  composition: Composition,
): Branch {
  let image = below;
  let input: RenderImage | undefined;
  let rangeSource: RenderImage | undefined;
  for (const layer of layers) {
    const branch = composeLayer(image, layer, composition);
    image = branch.image;
    input ??= branch.input;
    rangeSource ??= branch.rangeSource;
  }
  return { image, input, rangeSource };
}

/**
 * Pure layer composition shares the same graph for preview, crop, and export.
 * The image layer develops the photo first; layers above it process that floating-point result.
 * Display and export encode only after composition, so later layers can recover HDR headroom.
 */
export function createEditorRenderer(
  gpu: Gpu,
  source: ImageSource,
  {
    timer,
    paintPixels,
  }: { timer?: Timer; paintPixels?: (id: string) => Blob } = {},
) {
  return createRenderer(
    gpu,
    source,
    (image, scene, composition) => {
      const [sourceLayer, ...layers] = scene.layers;
      const name = `layer/${sourceLayer.id}`;
      composition.retain(name);
      const adjusted = pipeline(image, [
        adjustments(sourceLayer.adjustments, name),
      ]);
      const developed = pipeline(adjusted, [
        toneCurves(sourceLayer.toneCurve, `${name}/curves`),
      ]);
      const children = composeLayers(
        developed,
        sourceLayer.children,
        composition,
      );
      const composite = composeLayers(children.image, layers, composition);
      const full = composite.image;
      const [original, output] = transformImages(
        [input(source.image), full],
        scene.frame,
      );
      return {
        original,
        full,
        output,
        input:
          composition.inputId === sourceLayer.id
            ? adjusted
            : (children.input ?? composite.input),
        rangeSource: children.rangeSource ?? composite.rangeSource,
      };
    },
    timer,
    paintPixels,
  );
}
