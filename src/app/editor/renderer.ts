import type { Gpu, Timer } from "vgpu";
import {
  type MaskLayer,
  maskModifiers,
  type ProcessingLayer,
} from "@/core/document";
import type { ImageSource } from "@/core/image";
import {
  type Composition,
  type Coverage,
  createRenderer,
  input,
  maskInput,
  mixAdjustment,
  pipeline,
  type RenderImage,
  rangeCoverage,
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
};

/**
 * What a mask covers. A range selects from the image below, so the graph rasterizes a ranged mask
 * for it to blend through and for the overlay and thumbnails to show.
 */
function maskCoverage(
  layer: MaskLayer,
  below: RenderImage,
  name: string,
  composition: Composition,
): Coverage {
  const shape = {
    mask: layer.mask,
    modifiers: maskModifiers(layer),
    raster: composition.coverage(layer),
  };
  const ranged = layer.range && rangeCoverage(name, below, shape, layer.range);
  if (!ranged) {
    return shape;
  }
  composition.showCoverage(layer.id, ranged);
  return { ...shape, raster: ranged };
}

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
  if (bypassed && !inspected) {
    return { image: below };
  }
  const coverage =
    layer.kind === "mask"
      ? maskCoverage(layer, below, name, composition)
      : undefined;
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
        input = coverage && maskInput(name, adjusted, coverage);
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
    coverage,
  );
  return { image, input: input ?? children.input };
}

function composeLayers(
  below: RenderImage,
  layers: readonly ProcessingLayer[],
  composition: Composition,
): Branch {
  let image = below;
  let input: RenderImage | undefined;
  for (const layer of layers) {
    const branch = composeLayer(image, layer, composition);
    image = branch.image;
    input ??= branch.input;
  }
  return { image, input };
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
      };
    },
    timer,
    paintPixels,
  );
}
