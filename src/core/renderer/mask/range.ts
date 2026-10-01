import { type Mask, type MaskLayer, maskModifiers } from "@/core/document";
import { gradientParams } from "@/core/renderer/blend";
import {
  merge,
  node,
  type RenderImage,
  sourceSize,
} from "@/core/renderer/node";
import { paintingSize } from "@/core/renderer/paint";
import combineShader from "./combine.wgsl";
import shader from "./range.wgsl";

export function isRangeMask(mask: Mask) {
  return mask.kind === "color-range" || mask.kind === "luminance-range";
}

export function hasRangeMask(layer: MaskLayer) {
  return (
    isRangeMask(layer.mask) ||
    maskModifiers(layer).some(({ mask }) => isRangeMask(mask))
  );
}

function maskKind(mask: Mask) {
  if (mask.kind === "color-range") {
    return 4;
  }
  if (mask.kind === "luminance-range") {
    return 5;
  }
  return gradientParams(mask).kind;
}

function maskParams(mask: Mask) {
  const color = mask.kind === "color-range" ? mask.color : "#000000";
  return {
    ...gradientParams(mask),
    kind: maskKind(mask),
    color: [1, 3, 5].map(
      (start) => Number.parseInt(color.slice(start, start + 2), 16) / 255,
    ),
    tolerance: mask.kind === "color-range" ? mask.tolerance : 0,
    min: mask.kind === "luminance-range" ? mask.min : 0,
    max: mask.kind === "luminance-range" ? mask.max : 1,
    smoothness: "smoothness" in mask ? mask.smoothness : 0,
  };
}

/** Image-dependent coverage shares the brushes' resolution and follows the image below the group. */
export function rangeCoverage(
  source: RenderImage,
  layer: MaskLayer,
  brush: (id: string) => RenderImage | undefined,
) {
  const size = paintingSize(source.size);
  const extent = sourceSize(source);
  const scale = [extent[0] / size[0], extent[1] / size[1]] as const;
  const images = new Map<string, RenderImage>();
  function own(id: string, mask: Mask) {
    if (mask.kind === "brush") {
      return brush(id);
    }
    const image = merge(
      { source },
      node(`layer/${layer.id}/coverage/${id}`, shader, {
        size,
        format: "r8unorm",
        set: { params: { ...maskParams(mask), extent } },
      }),
    );
    return { ...image, scale };
  }
  let coverage = own(layer.id, layer.mask);
  function combine(id: string, added: RenderImage, strength: number) {
    return merge(
      { base: coverage ?? added, added },
      node(`layer/${layer.id}/coverage/combine/${id}`, combineShader, {
        size,
        format: "r8unorm",
        set: { params: { base: Number(Boolean(coverage)), strength } },
      }),
    );
  }
  for (const modifier of maskModifiers(layer)) {
    const added = own(modifier.id, modifier.mask);
    if (!added) {
      continue;
    }
    images.set(modifier.id, added);
    if (!coverage && modifier.operation === "subtract") {
      continue;
    }
    const strength =
      modifier.operation === "add" ? modifier.opacity : -modifier.opacity;
    coverage = combine(modifier.id, added, strength);
  }
  if (coverage) {
    images.set(layer.id, coverage);
  }
  return images;
}
