import type { Gradient, MaskModifier } from "@/core/document";
import { merge, node, type RenderImage } from "@/core/renderer/node";
import shader from "./mix.wgsl";

const emptyModifiers = new Float32Array(8);

/** Uniform fields for one gradient; kind 0 means full coverage. */
export function gradientParams(mask?: Gradient) {
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
    kind: Number(!!mask),
    first: mask?.start ?? [0, 0],
    second: mask?.end ?? [1, 0],
    feather: 0,
    angle: 0,
  };
}

/** Two vec4 per modifier: geometry, then signed strength, kind, feather, and angle. */
export function modifierData(modifiers: readonly MaskModifier[]) {
  if (!modifiers.length) {
    return emptyModifiers;
  }
  const data = new Float32Array(modifiers.length * 8);
  modifiers.forEach(({ mask, opacity, operation }, index) => {
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

/** Interpolates an adjustment result without changing image coverage or HDR headroom. */
export function mixAdjustment(
  name: string,
  original: RenderImage,
  edited: RenderImage,
  opacity: number,
  mask?: Gradient,
  modifiers: readonly MaskModifier[] = [],
) {
  if (original === edited || opacity === 0) {
    return original;
  }
  if (opacity === 1 && !mask) {
    return edited;
  }
  return merge(
    { original, edited },
    node(name, shader, {
      storage: { modifiers: modifierData(modifiers) },
      set: {
        params: {
          opacity,
          ...gradientParams(mask),
          modifierCount: modifiers.length,
        },
      },
    }),
  );
}
