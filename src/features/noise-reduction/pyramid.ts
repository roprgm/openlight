import { type Buffer, compute, type Gpu } from "vgpu";
import { weakMemo } from "@/lib/weak-memo";
import downShader from "./down.wgsl";
import fuseShader from "./fuse.wgsl";
import shrinkShader from "./shrink.wgsl";
import spreadShader from "./spread.wgsl";

export type Size = readonly [number, number];
/** One level of the spectrum: four half floats per texel, row after row. */
export type Spectrum = { buffer: Buffer; size: Size };
/** How the filter treats one of a spectrum's components. */
export type Component = {
  /** Noise deviations past which the first step keeps a coefficient. */
  threshold: number;
  /** How much more its noise counts in the second step's Wiener weights. */
  caution: number;
  /** Whether patches keep their means whole, as a component that holds a level must to stay unbiased. */
  mean: boolean;
};

const passes = weakMemo((gpu: Gpu) => ({
  down: compute(gpu, downShader),
  spread: compute(gpu, spreadShader),
  shrink: compute(gpu, shrinkShader),
  blurRows: compute(gpu, fuseShader, { entry: "blurRows" }),
  blurColumns: compute(gpu, fuseShader, { entry: "blurColumns" }),
  add: compute(gpu, fuseShader, { entry: "add" }),
}));

/** Levels of the pyramid at most, and the shortest side a level may have. */
const levels = 6;
const smallest = 32;
/** Spectrum texels along the side of the tile each workgroup of the filter takes. */
const tile = 32;
/** Spectrum texels along the side of each block that measures a level's noise. */
export const block = 16;
/** The flattest quarter of blocks gives the noise; their chi-squared estimates sit at 0.876 of it. */
const quartileBias = 0.876;
/**
 * How far a level's noise may exceed what white noise would leave there: lossy compression
 * correlates noise, raising it at coarse levels; texture raises a measure far more, and is not noise.
 */
const margin = 1.15;

function spectrum(gpu: Gpu, size: Size): Spectrum {
  const buffer = gpu.device.createBuffer({
    size: size[0] * size[1] * 8,
    usage: ["storage"],
  });
  return { buffer, size };
}

export function groups([width, height]: Size, side = 8) {
  return [Math.ceil(width / side), Math.ceil(height / side)] as const;
}

export function half([width, height]: Size): Size {
  return [Math.ceil(width / 2), Math.ceil(height / 2)];
}

/** Averages 2 × 2 texels of `source` into `output`, half its size. */
function down(gpu: Gpu, source: Spectrum, output: Spectrum) {
  passes(gpu)
    .down.set({
      sizes: { source: source.size, output: output.size },
      source: source.buffer,
      output: output.buffer,
    })
    .dispatch(...groups(output.size));
}

/** Adds averages of `pyramid`'s last level, each half the one before, down to `smallest` texels. */
function extendPyramid(gpu: Gpu, pyramid: Spectrum[]) {
  while (pyramid.length < levels) {
    const finer = pyramid[pyramid.length - 1];
    const size = half(finer.size);
    if (Math.min(...size) < smallest) return;
    const level = spectrum(gpu, size);
    pyramid.push(level);
    down(gpu, finer, level);
  }
}

/**
 * Each component's noise deviation in one level, from its flattest blocks, which texture can only
 * raise. Blocks without any detail, such as clipped highlights, hold no noise to measure; without
 * others, a component measures none.
 */
async function measureSpread(gpu: Gpu, { buffer, size }: Spectrum) {
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
      return quartile ? Math.sqrt(quartile / quartileBias) : 0;
    });
  } finally {
    blocks.dispose();
  }
}

/**
 * Each level's noise deviation per component, finest first. `finest` turns the finest level's
 * measures into its noise. A coarser level's flattest blocks give its noise, up to a margin over what
 * white noise would leave there, since they still hold texture.
 */
async function measureLevels(
  gpu: Gpu,
  pyramid: readonly Spectrum[],
  finest: (measured: readonly number[]) => readonly number[],
) {
  const measured = [];
  for (const level of pyramid) measured.push(await measureSpread(gpu, level));
  const base = finest(measured[0]);
  return measured.map((level, l) =>
    level.map((value, c) => {
      const white = base[c] * 2 ** -l;
      if (!l) return base[c];
      return value ? Math.min(value, margin * white) : white;
    }),
  );
}

/** The finest level's noise for a noise model that predicts unit noise, which lower measures correct. */
export function modeled(measured: readonly number[]) {
  return measured.map((value) => Math.min(value || 1, 1));
}

/** Each of four components' value, 0 past the components a spectrum holds. */
const padded = (values: readonly number[]) =>
  [0, 1, 2, 3].map((c) => values[c] ?? 0);

/** One step of the patch filter over `noisy` into `output`, shrinking by `pilot`'s Wiener weights if given. */
function shrink(
  gpu: Gpu,
  noisy: Spectrum,
  output: Spectrum,
  sigma: readonly number[],
  components: readonly Component[],
  pilot?: Spectrum,
) {
  const { size } = noisy;
  passes(gpu)
    .shrink.set({
      params: {
        size,
        channels: components.length,
        wiener: Number(Boolean(pilot)),
        sigma,
        threshold: padded(components.map((c) => c.threshold)),
        caution: padded(components.map((c) => c.caution)),
        mean: padded(components.map((c) => Number(c.mean))),
      },
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
  const { blurRows, blurColumns, add } = passes(gpu);
  const average = spectrum(gpu, coarse.size);
  const across = spectrum(gpu, coarse.size);
  const blurred = spectrum(gpu, coarse.size);
  const sizes = { fine: estimate.size, coarse: coarse.size };
  try {
    down(gpu, estimate, average);
    blurRows
      .set({
        sizes,
        average: average.buffer,
        coarse: coarse.buffer,
        across: across.buffer,
      })
      .dispatch(...groups(coarse.size));
    blurColumns
      .set({ sizes, across: across.buffer, blurred: blurred.buffer })
      .dispatch(...groups(coarse.size));
    add
      .set({
        sizes,
        fine: estimate.buffer,
        blurred: blurred.buffer,
        output: output.buffer,
      })
      .dispatch(...groups(estimate.size));
  } finally {
    average.buffer.dispose();
    across.buffer.dispose();
    blurred.buffer.dispose();
  }
}

/**
 * Denoises one level, taking its low frequencies from the estimate of the level below when there is
 * one: thresholding first, then Wiener shrinkage guided by that first estimate.
 */
function filterLevel(
  gpu: Gpu,
  noisy: Spectrum,
  coarse: Spectrum | undefined,
  sigma: readonly number[],
  components: readonly Component[],
) {
  const first = spectrum(gpu, noisy.size);
  try {
    const second = spectrum(gpu, noisy.size);
    try {
      shrink(gpu, noisy, first, sigma, components);
      if (!coarse) {
        shrink(gpu, noisy, second, sigma, components, first);
        return second;
      }
      fuse(gpu, first, coarse, second);
      shrink(gpu, noisy, first, sigma, components, second);
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
 * Denoises a spectrum of `size`, which `prepare` fills, through a pyramid of its averages from the
 * coarsest level up: each level's `components` are filtered at the noise they measure, which
 * `noiseOf` turns into the finest level's, and each level takes its low frequencies from the
 * estimate of the level below. Resolves to the finest estimate and the finest level's noise per
 * component; stops between steps once `signal` aborts.
 */
export async function reduceSpectrum(
  gpu: Gpu,
  size: Size,
  prepare: (finest: Spectrum) => void,
  noiseOf: (measured: readonly number[]) => readonly number[],
  components: readonly Component[],
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const pyramid = [spectrum(gpu, size)];
  let estimate: Spectrum | undefined;
  try {
    prepare(pyramid[0]);
    extendPyramid(gpu, pyramid);
    const noise = await measureLevels(gpu, pyramid, noiseOf);
    signal.throwIfAborted();
    for (let l = pyramid.length - 1; ; l--) {
      const coarse = estimate;
      const filtered = filterLevel(
        gpu,
        pyramid[l],
        coarse,
        noise[l],
        components,
      );
      estimate = filtered;
      coarse?.buffer.dispose();
      pyramid[l].buffer.dispose();
      // Each level submits before the next, so other GPU work, such as the display, runs between.
      await gpu.gpu.queue.onSubmittedWorkDone();
      signal.throwIfAborted();
      if (!l) return { estimate: filtered, noise: noise[0] };
    }
  } catch (error) {
    estimate?.buffer.dispose();
    throw error;
  } finally {
    for (const level of pyramid) level.buffer.dispose();
  }
}
