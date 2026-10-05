import type { Gpu } from "vgpu";
import type { ImageSource, Reduction } from "@/core/image";
import { reduceImage } from "./image";
import { reduceMosaic } from "./mosaic";

/**
 * Reduces a source's noise once at each anchor strength: a RAW photo on its mosaic before
 * demosaicing, any other image in its encoded color.
 */
export async function reduceNoise(
  gpu: Gpu,
  source: ImageSource,
  signal: AbortSignal,
): Promise<Reduction> {
  const mosaic = source.raw?.mosaic;
  if (mosaic) {
    return reduceMosaic(gpu, mosaic, signal);
  }
  if (source.raw) {
    throw Error("Only RAW photos with a 2 × 2 mosaic take noise reduction.");
  }
  return reduceImage(gpu, source, signal);
}
