import type { Gradient, Mask, MaskLayer, MaskModifier } from "@/core/document";
import {
  merge,
  node,
  type RenderImage,
  sourceSize,
} from "@/core/renderer/node";
import inputShader from "./input.wgsl";
import shader from "./mix.wgsl";
import rasterShader from "./raster.wgsl";
import rasterInputShader from "./raster-input.wgsl";

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
        set: { params: { opacity } },
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
        },
      },
    }),
  );
}

/** An image of `image`'s kind at the histogram's grid, standing for the same source pixels. */
function inputOutput(image: RenderImage, grid: readonly [number, number]) {
  const [width, height] = sourceSize(image);
  return {
    size: grid,
    format: image.format,
    scale: [width / grid[0], height / grid[1]] as const,
  };
}

const linear: GPUSamplerDescriptor = {
  minFilter: "linear",
  magFilter: "linear",
};

/**
 * The image a layer's curve receives, with the mask's coverage as alpha, so a histogram of it weighs
 * the pixels the curve affects. It is drawn on `grid`, the texels the histogram counts, each the very
 * image texel the histogram would read at full size, so inspecting a layer costs no full-size
 * texture. Layer opacity is left out: it scales the effect, not the region.
 */
export function curveInput(
  name: string,
  image: RenderImage,
  grid: readonly [number, number],
  mask?: Mask,
  modifiers: readonly MaskModifier[] = [],
  coverage?: RenderImage,
) {
  const output = inputOutput(image, grid);
  if (coverage) {
    return merge(
      { image, coverage },
      node(`${name}/raster-input`, rasterInputShader, {
        ...output,
        samplers: { coverageSampler: linear },
        set: { params: { grid } },
      }),
    );
  }
  const gradient = mask && isGradient(mask) ? mask : undefined;
  const gradients = gradient ? gradientModifiers(modifiers) : [];
  return merge(
    { image },
    node(`${name}/input`, inputShader, {
      ...output,
      storage: { modifiers: modifierData(gradients) },
      set: {
        params: {
          ...gradientParams(gradient),
          modifierCount: gradients.length,
          grid,
          imageScale: image.scale,
        },
      },
    }),
  );
}
