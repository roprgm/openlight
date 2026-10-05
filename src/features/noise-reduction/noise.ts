import { compute, type Gpu } from "vgpu";
import type { Mosaic } from "@/core/image";
import { weakMemo } from "@/lib/weak-memo";
import shader from "./noise.wgsl";

type Vec4 = [number, number, number, number];

/**
 * Sensor noise per 2 × 2 cell position: the variance of a sample `x` above black is
 * `gain · x + floor`, photon noise growing with the signal over the read noise.
 */
export type NoiseModel = { gain: Vec4; floor: Vec4 };

const measure = weakMemo((gpu: Gpu) =>
  compute(gpu, shader, { entry: "measure" }),
);

/** Sensor pixels along each block's side. */
const block = 16;
/** Equal-count bins of blocks along the signal, each of which yields one point to fit. */
const bins = 40;
/**
 * The variance of the quietest tenth of a bin's blocks comes from its flattest ones, which texture
 * reaches least; a block's estimate over 16 details is chi-squared, whose tenth percentile lies at
 * 0.582 of its mean.
 */
const quiet = 0.1;
const quietBias = 0.582;
/**
 * Texture only adds variance, so a bin this far above the fitted line holds texture rather than
 * noise; fitting again without such bins follows the noise where a detailed photo has few flat blocks.
 */
const envelope = 1.3;

function fitLine(points: readonly [number, number][]) {
  // Weighted by the inverse variance squared, so dark and bright bins count by relative error.
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    const w = 1 / (y * y);
    sw += w;
    sx += w * x;
    sy += w * y;
    sxx += w * x * x;
    sxy += w * x * y;
  }
  const gain = (sw * sxy - sx * sy) / (sw * sxx - sx * sx);
  const floor = (sy - gain * sx) / sw;
  if (!(gain > 0)) return { gain: 0, floor: sy / sw };
  if (!(floor > 0)) return { gain: sxy / sxx, floor: 0 };
  return { gain, floor };
}

/**
 * Fits one position's model to its blocks' means and variances, skipping clipped blocks; without
 * any, the photo shows no noise.
 */
export function fitNoise(
  means: readonly number[],
  variances: readonly number[],
) {
  const usable = means
    .map((mean, i) => [mean, variances[i]] as [number, number])
    .filter(([, variance]) => variance > 0)
    .sort(([a], [b]) => a - b);
  if (!usable.length) {
    return { gain: 0, floor: 0 };
  }
  // A small photo fits fewer points, down to one, which leaves read noise alone.
  const count = Math.min(bins, Math.ceil(usable.length / 16));
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const bin = usable.slice(
      Math.floor((i * usable.length) / count),
      Math.floor(((i + 1) * usable.length) / count),
    );
    const variances = bin.map(([, variance]) => variance).sort((a, b) => a - b);
    const mean = bin[Math.floor(bin.length / 2)][0];
    const variance = variances[Math.floor(bin.length * quiet)];
    points.push([mean, variance / quietBias]);
  }
  let fit = fitLine(points);
  for (let pass = 0; pass < 5; pass++) {
    const { gain, floor } = fit;
    const below = points.filter(([x, y]) => y <= envelope * (gain * x + floor));
    if (below.length < 3) break;
    fit = fitLine(below);
  }
  return fit;
}

/** Measures the mosaic's noise on the GPU from its flat blocks, then fits each position's model. */
export async function measureNoise(
  gpu: Gpu,
  { samples, pattern, black, white }: Mosaic,
): Promise<NoiseModel> {
  const columns = Math.floor(samples.width / block);
  const rows = Math.floor(samples.height / block);
  const stats = gpu.device.createBuffer({
    size: columns * rows * 32,
    usage: ["storage", "copy_src"],
  });
  try {
    measure(gpu)
      .set({
        samples,
        params: { black: pattern.map((color) => black[color]), white },
        blocks: stats,
      })
      .dispatch(columns, rows);
    const values = new Float32Array(await stats.read(columns * rows * 32));
    const gain: Vec4 = [0, 0, 0, 0];
    const floor: Vec4 = [0, 0, 0, 0];
    for (let position = 0; position < 4; position++) {
      const means: number[] = [];
      const variances: number[] = [];
      for (let i = 0; i < values.length; i += 8) {
        means.push(values[i + position]);
        variances.push(values[i + 4 + position]);
      }
      const fit = fitNoise(means, variances);
      gain[position] = fit.gain;
      floor[position] = fit.floor;
    }
    return { gain, floor };
  } finally {
    stats.dispose();
  }
}
