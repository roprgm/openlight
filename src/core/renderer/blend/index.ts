import type { Mask, MaskModifier } from "@/core/document";
import {
  merge,
  node,
  type RenderImage,
  type RenderInput,
} from "@/core/renderer/node";
import shader from "./mix.wgsl";
import rasterShader from "./raster.wgsl";

const emptyModifiers = new Float32Array(8);

/** Uniform fields for one gradient; kind 0 means full coverage. Brush masks have no analytical form. */
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

/** The modifiers with an analytical form; brush children only exist inside a raster. */
export function gradientModifiers(modifiers: readonly MaskModifier[]) {
  return modifiers.filter(({ mask }) => mask.kind !== "brush");
}

/** Two vec4 per gradient modifier: geometry, then signed strength, kind, feather, and angle. */
export function modifierData(modifiers: readonly MaskModifier[]) {
  const gradients = gradientModifiers(modifiers);
  if (!gradients.length) {
    return emptyModifiers;
  }
  const data = new Float32Array(gradients.length * 8);
  gradients.forEach(({ mask, opacity, operation }, index) => {
    const { first, second, kind, feather, angle } = gradientParams(mask);
    data.set(
      [
        ...first,
        ...second,
        operation === "add" ? opacity : -opacity,
        kind,
        feather,
        angle,
      ],
      index * 8,
    );
  });
  return data;
}

/**
 * Interpolates an adjustment result without changing image coverage or HDR headroom.
 * Rasterized coverage replaces the analytical gradients when a brush is involved.
 */
export function mixAdjustment(
  name: string,
  original: RenderImage,
  edited: RenderImage,
  opacity: number,
  mask?: Mask,
  modifiers: readonly MaskModifier[] = [],
  coverage?: RenderInput,
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
  if (mask?.kind === "brush") {
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
  coverage?: RenderInput,
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
  if (mask.kind === "brush") {
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
