import type { Gpu, Target, Timer } from "vgpu";
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
import { heal } from "@/features/heal/pass";
import { toneCurves } from "@/features/tone-curves/pass";
import { vignette } from "@/features/vignette/pass";

type Branch = {
  image: RenderImage;
  input?: RenderImage;
};

function composeLayer(
  below: RenderImage,
  layer: ProcessingLayer,
  composition: Composition,
  resolve?: (id: string) => Target,
): Branch {
  const name = `layer/${layer.id}`;
  composition.retain(name);
  // A hidden or transparent layer still shows what its curve receives while it is inspected.
  const bypassed = !layer.visible || layer.opacity === 0;
  const inspected =
    layer.id === composition.inputId ||
    (layer.kind === "heal" &&
      layer.patches.some((patch) => patch.id === composition.inputId));
  if (bypassed && !inspected) {
    return { image: below };
  }
  const masks = layer.kind === "mask" ? maskModifiers(layer) : [];
  const coverage =
    layer.kind === "mask" ? composition.coverage(layer) : undefined;
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
    case "color-mixer":
      edited = pipeline(below, [
        colorMixer(layer.colorMixer, `${name}/color-mixer`),
      ]);
      break;
    case "fill":
      edited = pipeline(below, [fill(layer.fill, `${name}/fill`)]);
      break;
    case "heal": {
      const result = heal(below, layer.patches, name, composition, resolve);
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
  const children = composeLayers(edited, effects, composition, resolve);
  const image = mixAdjustment(
    name,
    below,
    children.image,
    bypassed ? 0 : layer.opacity,
    layer.kind === "mask" ? layer.mask : undefined,
    masks,
    coverage,
  );
  return { image, input: input ?? children.input };
}

function composeLayers(
  below: RenderImage,
  layers: readonly ProcessingLayer[],
  composition: Composition,
  resolve?: (id: string) => Target,
): Branch {
  let image = below;
  let input: RenderImage | undefined;
  for (const layer of layers) {
    const branch = composeLayer(image, layer, composition, resolve);
    image = branch.image;
    input ??= branch.input;
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
  resolve?: (id: string) => Target,
) {
  return createRenderer(
    gpu,
    source,
    (image, scene, composition) => {
      const [sourceLayer, ...layers] = scene.layers;
      const name = `layer/${sourceLayer.id}`;
      composition.retain(name);
      const children = composeLayers(
        image,
        sourceLayer.children,
        composition,
        resolve,
      );
      const composite = composeLayers(
        children.image,
        layers,
        composition,
        resolve,
      );
      const adjusted = pipeline(composite.image, [
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
          composition.inputId === sourceLayer.id
            ? adjusted
            : (children.input ?? composite.input),
      };
    },
    timer,
  );
}
