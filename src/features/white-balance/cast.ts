import { compute, type Gpu, type Target } from "vgpu";
import { weakMemo } from "@/lib/weak-memo";
import shader from "./cast.wgsl";

export type Rgb = readonly [number, number, number];
/** A color cast: `warmth`, red over blue, and `green`, green over red and blue. */
export type Cast = { warmth: number; green: number };

export function castOf([red, green, blue]: Rgb): Cast {
  return { warmth: red - blue, green: green - (red + blue) / 2 };
}

const measure = weakMemo((gpu: Gpu) =>
  compute(gpu, shader, { entry: "measure" }),
);

/**
 * Reduces `image` on the GPU to the light's color in stops and each channel's level where the edges
 * are; nothing for an image without usable pixels.
 */
export async function measureLight(gpu: Gpu, image: Target) {
  const light = gpu.device.createBuffer({
    size: 32,
    usage: ["storage", "copy_src"],
  });
  try {
    measure(gpu).set({ source: image.color, light }).dispatch(1);
    const [r, g, b, , lr, lg, lb] = new Float32Array(await light.read(32));
    const stops: Rgb = [r, g, b];
    const level: Rgb = [lr, lg, lb];
    return stops.every(Number.isFinite) ? { stops, level } : undefined;
  } finally {
    light.dispose();
  }
}
