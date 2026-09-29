import { compute, type Gpu, type Target } from "vgpu";
import { weakMemo } from "@/lib/weak-memo";
import shader from "./cast.wgsl";

/** A color cast: `warmth`, red over blue, and `green`, green over red and blue. */
export type Cast = { warmth: number; green: number };

const measure = weakMemo((gpu: Gpu) =>
  compute(gpu, shader, { entry: "measure" }),
);

/**
 * Reduces `image` to its cast on the GPU and reads back four numbers: the cast in stops of light, and
 * in the log odds the adjustments shift.
 */
export async function measureCast(gpu: Gpu, image: Target) {
  const result = gpu.device.createBuffer({
    size: 16,
    usage: ["storage", "copy_src"],
  });
  try {
    measure(gpu).set({ source: image.color, result }).dispatch(1);
    const [warmth, green, oddsWarmth, oddsGreen] = new Float32Array(
      await result.read(16),
    );
    return {
      stops: { warmth, green } satisfies Cast,
      odds: { warmth: oddsWarmth, green: oddsGreen } satisfies Cast,
    };
  } finally {
    result.dispose();
  }
}
