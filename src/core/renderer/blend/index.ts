import type { Mask, MaskModifier, MaskRange } from "@/core/document";
import { parseColor } from "@/core/image/blend";
import { merge, node, type RenderImage } from "@/core/renderer/node";
import shader from "./mix.wgsl";
import rangeShader from "./range.wgsl";
import rasterShader from "./raster.wgsl";

/**
 * What a mask covers: its shape and the child masks that add or subtract, or once a brush or range is
 * involved, the raster that holds their coverage.
 */
export type Coverage = {
  mask: Mask;
  modifiers: readonly MaskModifier[];
  raster?: RenderImage;
};

const emptyModifiers = new Float32Array(8);

/** Uniform fields for an analytical mask; kind 0 means none. Brush masks have no analytical form. */
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
    kind: mask?.kind === "full" ? 3 : Number(mask?.kind === "linear"),
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

const linear: GPUSamplerDescriptor = {
  minFilter: "linear",
  magFilter: "linear",
};

/** What a blend returns: `edited` over `original`, `edited` with the coverage as alpha, or the coverage alone. */
const modes = { mix: 0, input: 1, coverage: 2 };

/** Blends through a mask's coverage, or everywhere without one, returning what `mode` asks for. */
function blend(
  name: string,
  original: RenderImage,
  edited: RenderImage,
  opacity: number,
  mode: keyof typeof modes,
  coverage?: Coverage,
) {
  if (coverage?.raster) {
    // A raster already is the coverage alone.
    if (mode === "coverage") {
      return coverage.raster;
    }
    return merge(
      { original, edited, coverage: coverage.raster },
      node(name, rasterShader, {
        samplers: { coverageSampler: linear },
        set: { params: { opacity, mode: modes[mode] } },
      }),
    );
  }
  const gradients = gradientModifiers(coverage?.modifiers ?? []);
  return merge(
    { original, edited },
    node(name, shader, {
      format: mode === "coverage" ? "r8unorm" : undefined,
      storage: { modifiers: modifierData(gradients) },
      set: {
        params: {
          opacity,
          ...gradientParams(coverage?.mask),
          modifierCount: gradients.length,
          scale: original.scale,
          mode: modes[mode],
        },
      },
    }),
  );
}

/** Whether a mask covers nothing yet: a brush has no coverage until it paints. */
function empty({ mask, raster }: Coverage) {
  return mask.kind === "brush" && !raster;
}

/**
 * Interpolates an adjustment result without changing image coverage or HDR headroom.
 * Rasterized coverage replaces the analytical gradients when a brush or range is involved.
 */
export function mixAdjustment(
  name: string,
  original: RenderImage,
  edited: RenderImage,
  opacity: number,
  coverage?: Coverage,
) {
  if (original === edited || opacity === 0) {
    return original;
  }
  if (!coverage) {
    return opacity === 1
      ? edited
      : blend(`${name}/mix`, original, edited, opacity, "mix");
  }
  if (empty(coverage)) {
    return original;
  }
  const kind = coverage.raster ? "raster" : "mix";
  return blend(`${name}/${kind}`, original, edited, opacity, "mix", coverage);
}

/**
 * The image a mask's curve receives, with the mask's coverage as alpha, so a histogram of it
 * weighs the pixels the curve affects. Layer opacity is left out: it scales the effect, not the region.
 */
export function maskInput(
  name: string,
  image: RenderImage,
  coverage: Coverage,
) {
  if (empty(coverage)) {
    return image;
  }
  const kind = coverage.raster ? "raster-input" : "input";
  return blend(`${name}/${kind}`, image, image, 1, "input", coverage);
}

/** Uniform fields for a range, its UI units scaled to 0..1. */
function rangeParams(range: MaskRange) {
  if (range.kind === "luminance") {
    const { low, high, smoothness } = range;
    return { kind: 1, range: [low / 100, high / 100, smoothness / 100, 0] };
  }
  return {
    kind: 2,
    range: [...parseColor(range.color), range.tolerance / 100],
  };
}

/**
 * A mask's coverage narrowed by its range, in an r8 raster at the image's resolution, since a range
 * follows the photo's own edges; nothing while the mask covers nothing. The mask blends through it,
 * and the overlay and thumbnails show it.
 */
export function rangeCoverage(
  name: string,
  below: RenderImage,
  coverage: Coverage,
  range: MaskRange,
) {
  if (empty(coverage)) {
    return undefined;
  }
  const { mask, modifiers, raster } = coverage;
  // A full mask covers everything until a child takes some away.
  const shaped =
    raster || mask.kind !== "full" || gradientModifiers(modifiers).length > 0;
  const shape = shaped
    ? blend(`${name}/shape`, below, below, 1, "coverage", coverage)
    : undefined;
  // Without a shape the image fills its binding, which `shaped` leaves unread.
  return merge(
    { image: below, shape: shape ?? below },
    node(`${name}/range`, rangeShader, {
      format: "r8unorm",
      samplers: { shapeSampler: linear },
      set: {
        params: { ...rangeParams(range), shaped: Number(Boolean(shape)) },
      },
    }),
  );
}
