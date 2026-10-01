import type { Gpu, Timer } from "vgpu";
import { maskModifiers, type ProcessingLayer } from "@/core/document";
import type { ImageSource } from "@/core/image";
import {
  type CacheKey,
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
  dependencies: readonly CacheKey[];
};

function composeLayer(
  below: RenderImage,
  layer: ProcessingLayer,
  composition: Composition,
  dependencies: readonly CacheKey[],
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
    return { image: below, dependencies };
  }
  const masks = layer.kind === "mask" ? maskModifiers(layer) : [];
  const coverage =
    layer.kind === "mask" ? composition.coverage(layer) : undefined;
  let input: RenderImage | undefined;
  let edited = below;
  let content = dependencies;
  switch (layer.kind) {
    case "details":
      content = [...dependencies, layer.details];
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
      content = [...dependencies, layer.adjustments, layer.toneCurve];
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
      content = [...dependencies, layer.exposure];
      edited = pipeline(below, [exposure(`${name}/exposure`, layer.exposure)]);
      break;
    case "vignette":
      content = [...dependencies, layer.vignette];
      edited = pipeline(below, [vignette(layer.vignette, `${name}/vignette`)]);
      break;
    case "grain":
      content = [...dependencies, layer.grain];
      edited = pipeline(below, [grain(layer.grain, `${name}/grain`)]);
      break;
    case "color-mixer":
      content = [...dependencies, layer.colorMixer];
      edited = pipeline(below, [
        colorMixer(layer.colorMixer, `${name}/color-mixer`),
      ]);
      break;
    case "fill":
      content = [...dependencies, layer.fill];
      edited = pipeline(below, [fill(layer.fill, `${name}/fill`)]);
      break;
    case "lut":
      content = [...dependencies, layer.lut];
      edited = pipeline(below, [lut(layer.lut, `${name}/lut`)]);
      break;
    case "paint":
      content = [...dependencies, layer.blend, layer.strokes, layer.raster];
      edited = paint(
        below,
        composition.paint(layer),
        layer.blend,
        `${name}/paint`,
      );
      break;
    case "heal": {
      content = [...dependencies, ...layer.patches];
      const result = heal(
        below,
        layer.patches,
        name,
        composition,
        dependencies,
      );
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
  const children = composeLayers(edited, effects, composition, content);
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
    dependencies: [...children.dependencies, layer],
  };
}

function composeLayers(
  below: RenderImage,
  layers: readonly ProcessingLayer[],
  composition: Composition,
  dependencies: readonly CacheKey[],
): Branch {
  let image = below;
  let input: RenderImage | undefined;
  let content = dependencies;
  for (const layer of layers) {
    const branch = composeLayer(image, layer, composition, content);
    image = branch.image;
    input ??= branch.input;
    content = branch.dependencies;
  }
  return { image, input, dependencies: content };
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
        [sourceLayer.adjustments, sourceLayer.toneCurve],
      );
      const composite = composeLayers(
        children.image,
        layers,
        composition,
        children.dependencies,
      );
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
