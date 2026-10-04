import type { MaskLayer, MaskModifier } from "@/core/document";
import { primariesIndex } from "@/core/image";
import {
  gradientModifiers,
  gradientParams,
  isGradient,
  merge,
  modifierData,
  node,
  type RenderImage,
} from "@/core/renderer";
import { isExposureOnly } from "@/features/adjustments/pass";
import { curveTable } from "@/features/tone-curves/pass";
import shader from "./mask-pass.wgsl";
import rasterShader from "./mask-pass-raster.wgsl";

/** Bound in place of an identity curve's table, which the shaders skip. */
const identity = new Float32Array(1);

/**
 * A mask layer's adjustments, curve, and mix in one pass over the image below, so no full-size
 * intermediate holds the edited image. It matches the separate passes, coverage included: without
 * a raster, a mask that is not a gradient covers nothing yet.
 */
export function maskPass(
  name: string,
  below: RenderImage,
  layer: MaskLayer,
  modifiers: readonly MaskModifier[],
  coverage?: RenderImage,
) {
  const table = curveTable(layer.toneCurve);
  const exposureOnly = isExposureOnly(layer.adjustments);
  if (!table && exposureOnly && layer.adjustments.exposure === 0) {
    return below;
  }
  const adjustments = {
    primaries: primariesIndex.rec2020,
    ...layer.adjustments,
  };
  const edit = {
    exposureOnly: Number(exposureOnly),
    curved: Number(Boolean(table)),
    opacity: layer.opacity,
  };
  const curve = table ?? identity;
  if (coverage) {
    return merge(
      { below, coverage },
      node(`${name}/mask-raster`, rasterShader, {
        samplers: {
          coverageSampler: { minFilter: "linear", magFilter: "linear" },
        },
        storage: { curve },
        set: { adjustments, params: edit },
      }),
    );
  }
  if (!isGradient(layer.mask)) {
    return below;
  }
  const gradients = gradientModifiers(modifiers);
  return merge(
    { below },
    node(`${name}/mask`, shader, {
      storage: { curve, modifiers: modifierData(gradients) },
      set: {
        adjustments,
        params: {
          ...edit,
          ...gradientParams(layer.mask),
          modifierCount: gradients.length,
          scale: below.scale,
        },
      },
    }),
  );
}
