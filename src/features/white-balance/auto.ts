import type { Gpu } from "vgpu";
import type { EditorDocument } from "@/core/document";
import { clamp } from "@/lib/math";
import { castOf, measureLight, type Rgb } from "./cast";
import {
  setIncrementalBalance,
  setWhiteBalance,
  whiteBalanceLimits,
} from "./edits";

/**
 * Light between tungsten and daylight follows the Planckian locus, where a blackbody gains 0.22 stops
 * of green per stop of warmth in the working space. Temperature controls move along it.
 */
const locusGreen = 0.22;
/**
 * A photo is seldom off the locus, while colored edges often mislead the estimate's green, so tint
 * takes a quarter of the green the locus doesn't explain.
 */
const tintShare = 0.25;

// A RAW photo's warmth in stops per mired and green per unit of tint, fitted on six cameras.
const rawWarmthPerMired = -0.01;
const rawGreenPerTint = -0.006;

// Each channel's gain in log odds per unit of the incremental controls: the first-order terms of
// adjustWhiteBalance in prepare.wgsl. Temperature bends harder toward blue than toward yellow.
const warming: Rgb = [0.0405, 0.0308, 0.0104];
const cooling: Rgb = [0.0095, -0.007, -0.0482];
const tinting: Rgb = [0.0053, -0.0059, 0.0102];

/** The cast that log-odds gains make where each channel sits at `level`, which they move by 1 − level. */
function moved([r, g, b]: Rgb, level: Rgb) {
  return castOf([r * (1 - level[0]), g * (1 - level[1]), b * (1 - level[2])]);
}

/**
 * Neutralizes the photo's cast, measured before any edit, as one edit: temperature takes all of the
 * warmth, tint a share of the green off the locus. A RAW photo's own balance moves from As Shot; any
 * other photo's incremental temperature and tint replace their values.
 */
export async function autoWhiteBalance(document: EditorDocument, gpu: Gpu) {
  const image = document.scene.getState().layers[0];
  const source = document.resources.get(image.source);
  const light = await measureLight(gpu, source.image);
  if (!light || document.closed) {
    return;
  }
  const cast = castOf(light.stops);
  const green = tintShare * (cast.green - locusGreen * cast.warmth);
  if (source.raw) {
    const { asShot } = source.raw;
    const limits = whiteBalanceLimits(asShot);
    const mireds = 1e6 / asShot.temperature - cast.warmth / rawWarmthPerMired;
    setWhiteBalance(document, {
      temperature: clamp(
        1e6 / Math.max(mireds, 1),
        limits.temperature.min,
        limits.temperature.max,
      ),
      tint: clamp(
        asShot.tint - green / rawGreenPerTint,
        limits.tint.min,
        limits.tint.max,
      ),
    });
    return;
  }
  const temperature = moved(cast.warmth > 0 ? cooling : warming, light.level);
  const tint = moved(tinting, light.level);
  setIncrementalBalance(document, image.id, {
    incrementalTemperature: clamp(-cast.warmth / temperature.warmth, -100, 100),
    incrementalTint: clamp(-green / tint.green, -100, 100),
  });
}
