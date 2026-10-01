import type { Gradient, Mask, MaskLayer, MaskModifier } from "@/core/document";
import { merge, node, type RenderImage } from "@/core/renderer/node";
import shader from "./mix.wgsl";
import rasterShader from "./raster.wgsl";

const emptyModifiers = new Float32Array(12);

/** Mask operations as the shaders number them. */
export const operations: Record<MaskLayer["operation"], number> = {
  add: 0,
  subtract: 1,
  intersect: 2,
};

/** Whether a mask has an analytical form; brushes and ranges only exist in a raster. */
export function isGradient(mask: Mask): mask is Gradient {
  return mask.kind === "linear" || mask.kind === "radial";
}

/** Uniform fields for one gradient; kind 0 means full coverage. */
export function gradientParams(mask?: Mask) {
  if (mask?.kind === "radial") {
    return {
      kind: 2,
      first: mask.center,
      second: mask.radius,
      feather: mask.feather,
      angle: (mask.angle * Math.PI) / 180,
    };
  }
  return {
    kind: Number(mask?.kind === "linear"),
    first: mask?.kind === "linear" ? mask.start : [0, 0],
    second: mask?.kind === "linear" ? mask.end : [1, 0],
    feather: 0,
    angle: 0,
  };
}

/** The modifiers with an analytical form. */
export function gradientModifiers(modifiers: readonly MaskModifier[]) {
  return modifiers.filter(({ mask }) => isGradient(mask));
}

/** Three vec4 per gradient modifier: geometry; strength, kind, feather, and angle; then operation. */
export function modifierData(modifiers: readonly MaskModifier[]) {
  const gradients = gradientModifiers(modifiers);
  if (!gradients.length) {
    return emptyModifiers;
  }
  const data = new Float32Array(gradients.length * 12);
  gradients.forEach(({ mask, opacity, operation }, index) => {
    const { first, second, kind, feather, angle } = gradientParams(mask);
    data.set(
      [
        ...first,
        ...second,
        opacity,
        kind,
        feather,
        angle,
        operations[operation],
        0,
        0,
        0,
      ],
      index * 12,
    );
  });
  return data;
}

/**
 * Interpolates an adjustment result without changing image coverage or HDR headroom.
 * Rasterized coverage replaces the analytical gradients when a brush or range is involved; without it,
 * such a mask covers nothing yet.
 */
export function mixAdjustment(
  name: string,
  original: RenderImage,
  edited: RenderImage,
  opacity: number,
  mask?: Mask,
  modifiers: readonly MaskModifier[] = [],
  coverage?: RenderImage,
) {
  if (original === edited || opacity === 0) {
    return original;
  }
  if (opacity === 1 && !mask) {
    return edited;
  }
  if (coverage) {
    return merge(
      { original, edited, coverage },
      node(`${name}/raster`, rasterShader, {
        samplers: {
          coverageSampler: { minFilter: "linear", magFilter: "linear" },
        },
        set: { params: { opacity, mode: 0 } },
      }),
    );
  }
  if (mask && !isGradient(mask)) {
    return original;
  }
  const gradients = gradientModifiers(modifiers);
  return merge(
    { original, edited },
    node(`${name}/mix`, shader, {
      storage: { modifiers: modifierData(gradients) },
      set: {
        params: {
          opacity,
          ...gradientParams(mask),
          modifierCount: gradients.length,
          scale: original.scale,
          mode: 0,
        },
      },
    }),
  );
}

/**
 * The image a mask's curve receives, with the mask's coverage as alpha, so a histogram of it
 * weighs the pixels the curve affects. Layer opacity is left out: it scales the effect, not the region.
 */
export function maskInput(
  name: string,
  image: RenderImage,
  mask: Mask,
  modifiers: readonly MaskModifier[] = [],
  coverage?: RenderImage,
) {
  if (coverage) {
    return merge(
      { original: image, edited: image, coverage },
      node(`${name}/raster-input`, rasterShader, {
        samplers: {
          coverageSampler: { minFilter: "linear", magFilter: "linear" },
        },
        set: { params: { opacity: 1, mode: 1 } },
      }),
    );
  }
  if (!isGradient(mask)) {
    return image;
  }
  const gradients = gradientModifiers(modifiers);
  return merge(
    { original: image, edited: image },
    node(`${name}/input`, shader, {
      storage: { modifiers: modifierData(gradients) },
      set: {
        params: {
          opacity: 1,
          ...gradientParams(mask),
          modifierCount: gradients.length,
          scale: image.scale,
          mode: 1,
        },
      },
    }),
  );
}
