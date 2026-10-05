import { compute, effect, frame, type Gpu, type Target, target } from "vgpu";
import type { Mosaic, NoiseReduction, Reduction } from "@/core/image";
import { weakMemo } from "@/lib/weak-memo";
import composeShader from "./compose.wgsl";
import finishShader from "./finish.wgsl";
import { anchors, componentShares } from "./model";
import { measureNoise, type NoiseModel } from "./noise";
import prepareShader from "./prepare.wgsl";
import {
  block,
  buildPyramid,
  filterPyramid,
  groups,
  measureLevels,
  modeled,
  type Size,
  spectrum,
} from "./pyramid";

const passes = weakMemo((gpu: Gpu) => ({
  prepare: compute(gpu, prepareShader),
  finish: effect(gpu, finishShader),
  compose: effect(gpu, composeShader),
}));

/**
 * The transform's largest value, in noise deviations: half floats keep it, and the filter's
 * fixed-point sums of its patches stay in range.
 */
const largest = 1024;

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

type NoiseParams = ReturnType<typeof noiseParams>;

/** Each anchor's change to the samples, a half-size target of each 2 × 2 cell's four by position. */
function createComposer(
  gpu: Gpu,
  mosaic: Mosaic,
  noise: NoiseParams,
  [weak, measured, strong]: readonly Target[],
  size: Size,
) {
  const output = target(gpu, { size, format: "rgba16float" });
  return {
    render(strengths: NoiseReduction) {
      const pass = passes(gpu).compose.set({
        noise,
        shares: componentShares(strengths),
        samples: mosaic.samples,
        weak: weak.color,
        measured: measured.color,
        strong: strong.color,
      });
      frame(gpu, (f) => f.pass(output, pass));
      return output;
    },
    dispose: () => output.color.dispose(),
  };
}

/**
 * Reduces a mosaic's noise before demosaicing, once at each anchor strength: its own noise model
 * makes the noise unit Gaussian, a pyramid of patch filtering removes it from fine detail to broad
 * color blotches, and the unbiased inverse returns samples. A composer then gives replacement
 * samples at any strengths at once: a half-size `rgba16float` target holding each 2 × 2 cell's four
 * samples by position, above black. Stops between levels once `signal` aborts.
 */
export async function reduceMosaic(
  gpu: Gpu,
  mosaic: Mosaic,
  signal: AbortSignal,
): Promise<Reduction> {
  const { prepare, finish } = passes(gpu);
  const size: Size = [
    Math.floor(mosaic.samples.width / 2),
    Math.floor(mosaic.samples.height / 2),
  ];
  if (Math.min(...size) < block) {
    throw Error("The photo is too small to reduce its noise.");
  }
  const noise = noiseParams(mosaic, await measureNoise(gpu, mosaic));
  signal.throwIfAborted();
  const finest = spectrum(gpu, size);
  prepare
    .set({ samples: mosaic.samples, noise, size, output: finest.buffer })
    .dispatch(...groups(size));
  const pyramid = buildPyramid(gpu, finest);
  const changes: Target[] = [];
  try {
    const levels = await measureLevels(gpu, pyramid, modeled);
    for (const strength of anchors) {
      const estimate = await filterPyramid(
        gpu,
        pyramid,
        levels,
        strength,
        4,
        signal,
      );
      try {
        const change = target(gpu, { size, format: "rgba16float" });
        changes.push(change);
        const pass = finish.set({
          noise,
          size,
          spectrum: estimate.buffer,
          samples: mosaic.samples,
        });
        frame(gpu, (f) => f.pass(change, pass));
      } finally {
        estimate.buffer.dispose();
      }
    }
  } catch (error) {
    for (const change of changes) change.color.dispose();
    throw error;
  } finally {
    for (const level of pyramid) level.buffer.dispose();
  }
  return {
    compose: () => createComposer(gpu, mosaic, noise, changes, size),
    dispose() {
      for (const change of changes) change.color.dispose();
    },
  };
}
