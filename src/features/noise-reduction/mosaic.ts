import { compute, effect, frame, type Gpu, type Target, target } from "vgpu";
import type { Mosaic, NoiseReduction, Reduction } from "@/core/image";
import { weakMemo } from "@/lib/weak-memo";
import composeShader from "./compose.wgsl";
import finishShader from "./finish.wgsl";
import { componentLimits } from "./model";
import { measureNoise, type NoiseModel } from "./noise";
import prepareShader from "./prepare.wgsl";
import {
  block,
  type Component,
  groups,
  modeled,
  reduceSpectrum,
  type Size,
} from "./pyramid";

const passes = weakMemo((gpu: Gpu) => ({
  prepare: compute(gpu, prepareShader),
  finish: effect(gpu, finishShader),
  compose: effect(gpu, composeShader),
}));

/**
 * How the filter treats light, the two color differences, and the greens' difference: color shrinks
 * twice as hard as light. The greens' difference holds less detail, so a coefficient needs more to
 * stand out and shrinks eight times as hard; both greens see the same light, so its patches' means
 * are noise or imbalance, which demosaicing would draw as a maze.
 */
const components: Component[] = [
  { threshold: 3, caution: 1, mean: true },
  { threshold: 3, caution: 2, mean: true },
  { threshold: 3, caution: 2, mean: true },
  { threshold: 3.5, caution: 8, mean: false },
];

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

/** Composes replacement samples at any strengths from the reduction's change, into a target of its own. */
function createComposer(
  gpu: Gpu,
  mosaic: Mosaic,
  noise: NoiseParams,
  reduction: Target,
) {
  const output = target(gpu, { size: reduction.size, format: "rgba16float" });
  return {
    render(strengths: NoiseReduction) {
      const pass = passes(gpu).compose.set({
        noise,
        limits: componentLimits(strengths),
        samples: mosaic.samples,
        reduction: reduction.color,
      });
      frame(gpu, (f) => f.pass(output, pass));
      return output;
    },
    dispose: () => output.color.dispose(),
  };
}

/**
 * Reduces a mosaic's noise before demosaicing: its own noise model makes the noise unit Gaussian, a
 * pyramid of patch filtering removes it from fine detail to broad color blotches, and the unbiased
 * inverse returns samples, kept as their change to the decoded ones. A composer then gives
 * replacement samples at any strengths at once: a half-size `rgba16float` target holding each 2 × 2
 * cell's four samples by position, above black. Stops between levels once `signal` aborts.
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
  const { estimate } = await reduceSpectrum(
    gpu,
    size,
    (finest) =>
      prepare
        .set({ samples: mosaic.samples, noise, size, output: finest.buffer })
        .dispatch(...groups(size)),
    modeled,
    components,
    signal,
  );
  try {
    const pass = finish.set({
      noise,
      size,
      spectrum: estimate.buffer,
      samples: mosaic.samples,
    });
    const change = target(gpu, { size, format: "rgba16float" });
    try {
      frame(gpu, (f) => f.pass(change, pass));
    } catch (error) {
      change.color.dispose();
      throw error;
    }
    return {
      compose: () => createComposer(gpu, mosaic, noise, change),
      dispose: () => change.color.dispose(),
    };
  } finally {
    estimate.buffer.dispose();
  }
}
