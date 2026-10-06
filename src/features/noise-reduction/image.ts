import {
  type Compute,
  compute,
  type Effect,
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
import { componentLimits } from "./model";
import prepareShader from "./prepare-image.wgsl";
import {
  block,
  type Component,
  groups,
  half,
  reduceSpectrum,
  type Size,
} from "./pyramid";

/** The noise 8-bit samples hold at least, their rounding, in the encoding's units. */
const rounding = 1 / 255 / Math.sqrt(12);

/**
 * One of the spectra an image reduces apart: how it is made and returns, at what size and format, how
 * its components filter, and their noise from the finest level's measures.
 */
type Part = {
  prepare: Compute;
  finish: Effect;
  size: (image: Size) => Size;
  format: GPUTextureFormat;
  components: readonly Component[];
  noise: (measured: readonly number[]) => readonly number[];
};

/**
 * Light returns at full size from its Haar components, which filter alike; white noise holds the
 * same deviation in each, so the least measure, which texture raises least, gives all of theirs.
 * Color returns at half size, which a reduced image's color needs no more of, and its two
 * differences shrink twice as hard as light.
 */
const passes = weakMemo((gpu: Gpu) => ({
  light: {
    prepare: compute(gpu, prepareShader, { entry: "light" }),
    finish: effect(gpu, finishLightShader),
    size: (image: Size) => image,
    format: "r16float",
    components: Array<Component>(4).fill({
      threshold: 3,
      caution: 1,
      mean: true,
    }),
    noise: (measured: readonly number[]) => {
      // A component without detail anywhere, such as an enlarged image's differences, measures none.
      const measures = measured.filter((value) => value > 0);
      const least = measures.length ? Math.min(...measures) : 0;
      return measured.map(() => Math.max(least, rounding));
    },
  } satisfies Part,
  color: {
    prepare: compute(gpu, prepareShader, { entry: "color" }),
    finish: effect(gpu, finishColorShader),
    size: half,
    format: "rg16float",
    components: Array<Component>(2).fill({
      threshold: 3,
      caution: 2,
      mean: true,
    }),
    noise: (measured: readonly number[]) =>
      measured.map((value) => Math.max(value, rounding)),
  } satisfies Part,
  compose: effect(gpu, composeShader),
}));

/**
 * Composes the image at any strengths from its reduced light and color, into a target of its own
 * in the image's format: 8-bit images stay 8-bit, dithered.
 */
function createComposer(
  gpu: Gpu,
  { image }: EncodedImage,
  light: Target,
  color: Target,
  noise: readonly number[],
) {
  const output = target(gpu, { size: image.size, format: image.format });
  const quantum = image.format === "rgba8unorm-srgb" ? 1 / 255 : 0;
  return {
    render(strengths: NoiseReduction) {
      const pass = passes(gpu).compose.set({
        limits: componentLimits(strengths),
        params: { noise, quantum },
        source: image.color,
        linearSampler: sampler(gpu, {
          minFilter: "linear",
          magFilter: "linear",
        }),
        light: light.color,
        color: color.color,
      });
      frame(gpu, (f) => f.pass(output, pass));
      return output;
    },
    dispose: () => output.color.dispose(),
  };
}

/** Reduces one of an image's spectra into a target of its own, with the noise it measured per component. */
async function reducePart(
  gpu: Gpu,
  image: Target,
  part: Part,
  signal: AbortSignal,
) {
  const size = half(image.size);
  const { estimate, noise } = await reduceSpectrum(
    gpu,
    size,
    (finest) =>
      part.prepare
        .set({ source: image.color, size, output: finest.buffer })
        .dispatch(...groups(size)),
    part.noise,
    part.components,
    signal,
  );
  try {
    const pass = part.finish.set({ size, spectrum: estimate.buffer });
    const output = target(gpu, {
      size: part.size(image.size),
      format: part.format,
    });
    try {
      frame(gpu, (f) => f.pass(output, pass));
    } catch (error) {
      output.color.dispose();
      throw error;
    }
    return { output, noise };
  } finally {
    estimate.buffer.dispose();
  }
}

/**
 * Reduces an image's noise in its encoded light and color, each at half size and apart, with no
 * noise model: each level's noise comes from its flattest blocks. A composer then gives the image at
 * any strengths at once. Color reduces first, so only its smaller result waits through light's. Stops
 * between levels once `signal` aborts.
 */
export async function reduceImage(
  gpu: Gpu,
  encoded: EncodedImage,
  signal: AbortSignal,
): Promise<Reduction> {
  const { image } = encoded;
  if (Math.min(...half(image.size)) < block) {
    throw Error("The image is too small to reduce its noise.");
  }
  const parts = passes(gpu);
  const color = await reducePart(gpu, image, parts.color, signal);
  try {
    const light = await reducePart(gpu, image, parts.light, signal);
    const noise = [light.noise[0], color.noise[0], color.noise[1], 0];
    return {
      compose: () =>
        createComposer(gpu, encoded, light.output, color.output, noise),
      dispose() {
        light.output.color.dispose();
        color.output.color.dispose();
      },
    };
  } catch (error) {
    color.output.color.dispose();
    throw error;
  }
}
