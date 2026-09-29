import type { Gpu } from "vgpu";
import type { EditorDocument } from "@/core/document";
import { clamp } from "@/lib/math";
import { type Cast, castOf, measureLight, type Rgb } from "./cast";
import {
  setIncrementalBalance,
  setWhiteBalance,
  whiteBalanceLimits,
} from "./edits";

/** How a cast moves per unit of a temperature and a tint control. */
type Response = { temperature: Cast; tint: Cast };

// A RAW photo's cast in stops per mired and per unit of tint, fitted on six cameras' as-shot developments.
const raw: Response = {
  temperature: { warmth: -0.01, green: -0.0023 },
  tint: { warmth: -0.003, green: -0.006 },
};

// Each channel's gain in log odds per unit of the incremental controls: the first-order terms of
// adjustWhiteBalance in prepare.wgsl. Temperature bends harder toward blue than toward yellow.
const warming: Rgb = [0.0405, 0.0308, 0.0104];
const cooling: Rgb = [0.0095, -0.007, -0.0482];
const tinting: Rgb = [0.0053, -0.0059, 0.0102];

/** The cast that log-odds gains make where each channel sits at `level`, which they move by 1 − level. */
function moved([r, g, b]: Rgb, level: Rgb) {
  return castOf([r * (1 - level[0]), g * (1 - level[1]), b * (1 - level[2])]);
}

/** The temperature and tint changes that cancel `cast` under a linear response. */
function correction(cast: Cast, { temperature, tint }: Response) {
  const determinant =
    temperature.warmth * tint.green - tint.warmth * temperature.green;
  return [
    (tint.warmth * cast.green - cast.warmth * tint.green) / determinant,
    (temperature.green * cast.warmth - temperature.warmth * cast.green) /
      determinant,
  ] as const;
}

/**
 * Neutralizes the photo's cast, measured before any edit, as one edit: a RAW photo's own balance moves
 * from As Shot, and any other photo's incremental temperature and tint replace their values.
 */
export async function autoWhiteBalance(document: EditorDocument, gpu: Gpu) {
  const image = document.scene.getState().layers[0];
  const source = document.resources.get(image.source);
  const light = await measureLight(gpu, source.image);
  if (!light || document.closed) {
    return;
  }
  const cast = castOf(light.stops);
  if (source.raw) {
    const { asShot } = source.raw;
    const limits = whiteBalanceLimits(asShot);
    const [mireds, tint] = correction(cast, raw);
    setWhiteBalance(document, {
      temperature: clamp(
        1e6 / Math.max(1e6 / asShot.temperature + mireds, 1),
        limits.temperature.min,
        limits.temperature.max,
      ),
      tint: clamp(asShot.tint + tint, limits.tint.min, limits.tint.max),
    });
    return;
  }
  const [temperature, tint] = correction(cast, {
    temperature: moved(cast.warmth > 0 ? cooling : warming, light.level),
    tint: moved(tinting, light.level),
  });
  setIncrementalBalance(document, image.id, {
    incrementalTemperature: clamp(temperature, -100, 100),
    incrementalTint: clamp(tint, -100, 100),
  });
}
