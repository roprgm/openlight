import {
  type Buffer,
  compute,
  effect,
  frame,
  type Gpu,
  type Target,
  target,
} from "vgpu";
import type { Mosaic } from "@/core/image";
import { weakMemo } from "@/lib/weak-memo";
import downShader from "./down.wgsl";
import finishShader from "./finish.wgsl";
import fuseShader from "./fuse.wgsl";
import { measureNoise, type NoiseModel } from "./noise";
import prepareShader from "./prepare.wgsl";
import shrinkShader from "./shrink.wgsl";
import spreadShader from "./spread.wgsl";

type Size = readonly [number, number];
/** One level of the spectrum: four half floats per texel, row after row. */
type Spectrum = { buffer: Buffer; size: Size };

const passes = weakMemo((gpu: Gpu) => ({
  prepare: compute(gpu, prepareShader),
  down: compute(gpu, downShader),
  spread: compute(gpu, spreadShader),
  shrink: compute(gpu, shrinkShader),
  blurRows: compute(gpu, fuseShader, { entry: "blurRows" }),
  blurColumns: compute(gpu, fuseShader, { entry: "blurColumns" }),
  finish: effect(gpu, finishShader),
}));

/** Levels of the pyramid at most, and the shortest side a level may have. */
const levels = 6;
const smallest = 32;
/** Spectrum texels along the side of the tile each workgroup of the filter takes. */
const tile = 32;
/** Spectrum texels along the side of each block that measures a level's noise. */
const block = 16;
/**
 * The transform's largest value, in noise deviations: half floats keep it, and the filter's
 * fixed-point sums of its patches stay in range.
 */
const largest = 1024;
/** The flattest quarter of blocks gives the noise; their chi-squared estimates sit at 0.885 of it. */
const quartileBias = 0.885;

function spectrum(gpu: Gpu, size: Size): Spectrum {
  const buffer = gpu.device.createBuffer({
    size: size[0] * size[1] * 8,
    usage: ["storage"],
  });
  return { buffer, size };
}

function groups([width, height]: Size, side = 8) {
  return [Math.ceil(width / side), Math.ceil(height / side)] as const;
}

/**
 * The least floor that keeps the transform of a sample `range` above black within `largest`: solving
 * 2r / (√(a·r + c) + √c) = L for √c, with c = 3/8 · a² + b. A photo with little noise, which would
 * stretch the transform further, is filtered as if it had that much.
 */
function leastFloor(gain: number, range: number) {
  const root = range / largest - (gain * largest) / 4;
  return root > 0 ? root * root - 0.375 * gain * gain : 0;
}

/** The filter's noise model per 2 × 2 position, and the positions of red, the two greens, and blue. */
function noiseParams(
  { pattern, black, white }: Mosaic,
  { gain, floor }: NoiseModel,
) {
  const greens = [0, 1, 2, 3].filter((p) => pattern[p] % 2 === 1);
  const blacks = pattern.map((color) => black[color]);
  return {
    order: [pattern.indexOf(0), greens[0], greens[1], pattern.indexOf(2)],
    black: blacks,
    gain,
    floor: floor.map((b, p) =>
      Math.max(b, leastFloor(gain[p], white - blacks[p])),
    ),
  };
}

/**
 * Each component's noise deviation in one level of the spectrum, from its flattest blocks: unit at
 * the finest level when the model fits, and halving with each level only where the noise is white.
 * Blocks without any detail, such as clipped highlights, hold no noise to measure; without others,
 * the level takes `expected`, the deviation white noise would have.
 */
async function measureSpread(
  gpu: Gpu,
  { buffer, size }: Spectrum,
  expected: number,
) {
  const columns = Math.floor(size[0] / block);
  const rows = Math.floor(size[1] / block);
  const blocks = gpu.device.createBuffer({
    size: columns * rows * 16,
    usage: ["storage", "copy_src"],
  });
  try {
    passes(gpu)
      .spread.set({ size, spectrum: buffer, blocks })
      .dispatch(columns, rows);
    const values = new Float32Array(await blocks.read(columns * rows * 16));
    return [0, 1, 2, 3].map((component) => {
      const variances = values
        .filter((variance, i) => i % 4 === component && variance > 0)
        .sort((a, b) => a - b);
      const quartile = variances[Math.floor(variances.length / 4)];
      return quartile ? Math.sqrt(quartile / quartileBias) : expected;
    });
  } finally {
    blocks.dispose();
  }
}

/** One step of the patch filter over `noisy` into `output`, shrinking by `pilot`'s Wiener weights if given. */
function shrink(
  gpu: Gpu,
  noisy: Spectrum,
  output: Spectrum,
  sigma: number[],
  pilot?: Spectrum,
) {
  const { size } = noisy;
  passes(gpu)
    .shrink.set({
      params: { size, sigma, wiener: Number(Boolean(pilot)) },
      noisy: noisy.buffer,
      pilot: (pilot ?? noisy).buffer,
      output: output.buffer,
    })
    .dispatch(...groups(size, tile));
}

/** Replaces `estimate`'s low frequencies with those of `coarse`, the estimate of the level below, into `output`. */
function fuse(
  gpu: Gpu,
  estimate: Spectrum,
  coarse: Spectrum,
  output: Spectrum,
) {
  const { down, blurRows, blurColumns } = passes(gpu);
  const average = spectrum(gpu, coarse.size);
  const across = spectrum(gpu, estimate.size);
  const sizes = { fine: estimate.size, coarse: coarse.size };
  try {
    down
      .set({
        sizes: { source: estimate.size, output: coarse.size },
        source: estimate.buffer,
        output: average.buffer,
      })
      .dispatch(...groups(coarse.size));
    blurRows
      .set({
        sizes,
        average: average.buffer,
        coarse: coarse.buffer,
        across: across.buffer,
      })
      .dispatch(...groups(estimate.size));
    blurColumns
      .set({
        sizes,
        fine: estimate.buffer,
        across: across.buffer,
        output: output.buffer,
      })
      .dispatch(...groups(estimate.size));
  } finally {
    average.buffer.dispose();
    across.buffer.dispose();
  }
}

/**
 * Denoises one level of the pyramid, taking its low frequencies from the estimate of the level below
 * when there is one: thresholding first, then Wiener shrinkage guided by that first estimate.
 * `expected` is the level's noise deviation were the noise white.
 */
async function denoiseLevel(
  gpu: Gpu,
  noisy: Spectrum,
  coarse: Spectrum | undefined,
  expected: number,
  signal?: AbortSignal,
) {
  const sigma = await measureSpread(gpu, noisy, expected);
  signal?.throwIfAborted();
  const first = spectrum(gpu, noisy.size);
  try {
    const second = spectrum(gpu, noisy.size);
    try {
      shrink(gpu, noisy, first, sigma);
      if (!coarse) {
        shrink(gpu, noisy, second, sigma, first);
        return second;
      }
      fuse(gpu, first, coarse, second);
      shrink(gpu, noisy, first, sigma, second);
      fuse(gpu, first, coarse, second);
      return second;
    } catch (error) {
      second.buffer.dispose();
      throw error;
    }
  } finally {
    first.buffer.dispose();
  }
}

/**
 * Denoises `pyramid`, finest level first, from its coarsest level up: each level takes its low
 * frequencies from the estimate of the one below it. `expected` is the finest level's noise
 * deviation were the noise white, and halves with each level.
 */
async function denoisePyramid(
  gpu: Gpu,
  [level, ...coarser]: readonly Spectrum[],
  signal?: AbortSignal,
  expected = 1,
): Promise<Spectrum> {
  const coarse = coarser.length
    ? await denoisePyramid(gpu, coarser, signal, expected / 2)
    : undefined;
  try {
    return await denoiseLevel(gpu, level, coarse, expected, signal);
  } finally {
    coarse?.buffer.dispose();
  }
}

/**
 * Removes the mosaic's noise before demosaicing: its own noise model makes the noise unit Gaussian,
 * a pyramid of patch filtering removes it from fine detail to broad color blotches, and the result
 * returns to sensor samples: a half-size `rgba16float` target holding each 2 × 2 cell's four samples
 * by position, above their black level. Stops at the next readback once `signal` aborts.
 */
export async function denoiseMosaic(
  gpu: Gpu,
  mosaic: Mosaic,
  signal?: AbortSignal,
): Promise<Target> {
  const { prepare, down, finish } = passes(gpu);
  const size: Size = [
    Math.floor(mosaic.samples.width / 2),
    Math.floor(mosaic.samples.height / 2),
  ];
  if (Math.min(...size) < block) {
    throw Error("The photo is too small to reduce its noise.");
  }
  const noise = noiseParams(mosaic, await measureNoise(gpu, mosaic));
  signal?.throwIfAborted();
  const pyramid = [spectrum(gpu, size)];
  try {
    prepare
      .set({ samples: mosaic.samples, noise, size, output: pyramid[0].buffer })
      .dispatch(...groups(size));
    while (pyramid.length < levels) {
      const finer = pyramid[pyramid.length - 1];
      const next: Size = [
        Math.ceil(finer.size[0] / 2),
        Math.ceil(finer.size[1] / 2),
      ];
      if (Math.min(...next) < smallest) break;
      const level = spectrum(gpu, next);
      down
        .set({
          sizes: { source: finer.size, output: next },
          source: finer.buffer,
          output: level.buffer,
        })
        .dispatch(...groups(next));
      pyramid.push(level);
    }
    const estimate = await denoisePyramid(gpu, pyramid, signal);
    try {
      const output = target(gpu, { size, format: "rgba16float" });
      const filtered = estimate.buffer;
      frame(gpu, (f) =>
        f.pass(output, finish.set({ noise, size, spectrum: filtered })),
      );
      return output;
    } finally {
      estimate.buffer.dispose();
    }
  } finally {
    for (const level of pyramid) level.buffer.dispose();
  }
}
