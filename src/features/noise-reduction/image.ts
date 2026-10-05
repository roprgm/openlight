import {
  compute,
  effect,
  frame,
  type Gpu,
  sampler,
  type Target,
  target,
} from "vgpu";
import type { EncodedImage, NoiseReduction, Reduction } from "@/core/image";
import { weakMemo } from "@/lib/weak-memo";
import composeShader from "./compose-image.wgsl";
import finishColorShader from "./finish-color.wgsl";
import finishLightShader from "./finish-light.wgsl";
import { anchors, componentShares } from "./model";
import prepareShader from "./prepare-image.wgsl";
import {
  block,
  buildPyramid,
  filterPyramid,
  groups,
  half,
  measureLevels,
  type Size,
  spectrum,
} from "./pyramid";

const passes = weakMemo((gpu: Gpu) => ({
  prepare: compute(gpu, prepareShader),
  light: effect(gpu, finishLightShader),
  color: effect(gpu, finishColorShader),
  compose: effect(gpu, composeShader),
}));

/** The noise 8-bit samples hold at least, their rounding, in the encoding's units. */
const rounding = 1 / 255 / Math.sqrt(12);

/** An anchor's light at full size and color at half. */
type Anchor = { light: Target; color: Target };

function createComposer(
  gpu: Gpu,
  { image }: EncodedImage,
  [weak, measured, strong]: readonly Anchor[],
) {
  const output = target(gpu, { size: image.size, format: "rgba16float" });
  return {
    render(strengths: NoiseReduction) {
      const pass = passes(gpu).compose.set({
        shares: componentShares(strengths),
        source: image.color,
        linearSampler: sampler(gpu, {
          minFilter: "linear",
          magFilter: "linear",
        }),
        weakLight: weak.light.color,
        measuredLight: measured.light.color,
        strongLight: strong.light.color,
        weakColor: weak.color.color,
        measuredColor: measured.color.color,
        strongColor: strong.color.color,
      });
      frame(gpu, (f) => f.pass(output, pass));
      return output;
    },
    dispose: () => output.color.dispose(),
  };
}

function disposeAnchors(anchors: readonly Anchor[]) {
  for (const { light, color } of anchors) {
    light.color.dispose();
    color.color.dispose();
  }
}

/**
 * Reduces an image's noise, once at each anchor strength, in its encoded light and color, with no
 * noise model: each level's noise comes from its flattest blocks. A composer then gives the image
 * at any strengths at once, linear in the image's primaries as an `rgba16float` target. Stops
 * between levels once `signal` aborts.
 */
export async function reduceImage(
  gpu: Gpu,
  encoded: EncodedImage,
  signal: AbortSignal,
): Promise<Reduction> {
  const { prepare, light, color } = passes(gpu);
  const size: Size = encoded.image.size;
  if (Math.min(...size) < block) {
    throw Error("The image is too small to reduce its noise.");
  }
  const finest = spectrum(gpu, size);
  prepare
    .set({ source: encoded.image.color, size, output: finest.buffer })
    .dispatch(...groups(size));
  const pyramid = buildPyramid(gpu, finest);
  const reduced: Anchor[] = [];
  try {
    const levels = await measureLevels(gpu, pyramid, (measured) =>
      Math.max(measured, rounding),
    );
    for (const strength of anchors) {
      const estimate = await filterPyramid(
        gpu,
        pyramid,
        levels,
        strength,
        3,
        signal,
      );
      try {
        const anchor = {
          light: target(gpu, { size, format: "r16float" }),
          color: target(gpu, { size: half(size), format: "rg16float" }),
        };
        reduced.push(anchor);
        const params = { size, spectrum: estimate.buffer };
        frame(gpu, (f) => {
          f.pass(anchor.light, light.set(params));
          f.pass(anchor.color, color.set(params));
        });
      } finally {
        estimate.buffer.dispose();
      }
    }
  } catch (error) {
    disposeAnchors(reduced);
    throw error;
  } finally {
    for (const level of pyramid) level.buffer.dispose();
  }
  return {
    compose: () => createComposer(gpu, encoded, reduced),
    dispose: () => disposeAnchors(reduced),
  };
}
