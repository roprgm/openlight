import { z } from "zod/mini";
import type { ImageSource, NoiseReduction } from "@/core/image";
import { range } from "@/lib/parse";

export const defaultNoiseReduction: NoiseReduction = { luminance: 0, color: 0 };

/** Whether a source takes noise reduction: a RAW photo through its 2 × 2 mosaic, any other image itself. */
export function reducible(source: ImageSource) {
  return !source.raw || Boolean(source.raw.mosaic);
}

/** How much noise reduction removes from light and from color, each 0 to 100; 0 keeps it. */
export const noiseReductionSchema = z.object({
  luminance: range(0, 100),
  color: range(0, 100),
}) satisfies z.ZodMiniType<NoiseReduction>;

/**
 * The strengths a photo's reduction is made at once, as multiples of the noise it measures, and the
 * amounts that reach each, so an amount scales the noise filtered linearly: near 50 a reduced test
 * photo comes closest to its clean original, and 100 smooths twice as hard. An amount between two
 * blends their results, and one below the weakest blends it with the photo as decoded.
 */
export const anchors = [0.35, 0.7, 1.4];
const amounts = [25, 50, 100];

/** Each anchor's share of the result at `amount`, 0 to 100; what remains is the photo as decoded. */
export function anchorShares(amount: number) {
  const shares = anchors.map(() => 0);
  const next = amounts.findIndex((at) => amount <= at);
  if (amount <= 0) {
    return shares;
  }
  if (next === -1) {
    shares[shares.length - 1] = 1;
    return shares;
  }
  const from = next ? amounts[next - 1] : 0;
  const t = (amount - from) / (amounts[next] - from);
  shares[next] = t;
  if (next) {
    shares[next - 1] = 1 - t;
  }
  return shares;
}

/**
 * Each anchor's share per component of the spectrum: light follows luminance, the two color
 * differences follow color, and the greens' difference, which demosaicing draws as a maze, the
 * stronger of the two.
 */
export function componentShares({ luminance, color }: NoiseReduction) {
  const light = anchorShares(luminance);
  const tint = anchorShares(color);
  const split = anchorShares(Math.max(luminance, color));
  return anchors.map((_, k) => [light[k], tint[k], tint[k], split[k]]);
}
