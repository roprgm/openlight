import { luminance, toWorking } from "../../core/image/color.wgsl";
import { adjustBlacks } from "./blacks.wgsl";
import { adjustHighlights } from "./highlights.wgsl";
import { adjustShadows } from "./shadows.wgsl";
import { adjustWhites } from "./whites.wgsl";
import { Adjustments, adjustExposure, prepareColor } from "./prepare.wgsl";

fn interpolateGain(amount: f32, half: vec3f, full: vec3f) -> vec3f {
  let strength = 2.0 * abs(amount);
  return mix(half * min(strength, 1.0), full, max(strength - 1.0, 0.0));
}

fn adjustContrast(color: vec3f, amount: f32) -> vec3f {
  let positive = interpolateGain(amount - 1.0, vec3f(0.32, 1.48, 0.0), vec3f(0.59, 2.77, 0.0)).xy;
  let gain = select(positive, vec2f(-0.43, -2.51) * (1.0 - amount), amount < 1.0);
  let bounded = min(color, vec3f(1.0));
  return color + bounded * (1.0 - bounded) * (gain.x + gain.y * (bounded - 0.5));
}

fn adjustSaturation(color: vec3f, amount: f32) -> vec3f {
  let gray = vec3f(luminance(color));
  return gray + (color - gray) * amount;
}

fn adjustVibrance(color: vec3f, amount: f32) -> vec3f {
  let high = max(max(color.r, color.g), color.b);
  let low = max(0.0, min(min(color.r, color.g), color.b));
  let saturation = 1.0 - sqrt(low / max(high, 0.000001));
  let scale = 1.0 + amount * select(0.63, 0.23, amount < 0.0) * (1.0 - sign(amount) * saturation);
  return max(vec3f(high) + (color - vec3f(high)) * scale, vec3f(0.0));
}

export fn adjustColor(input: vec3f, adjustments: Adjustments) -> vec3f {
  let prepared = prepareColor(input, adjustments);
  var color = adjustHighlights(prepared, adjustments.highlights);
  color = adjustShadows(color, adjustments.shadows);
  color = adjustWhites(color, adjustments.whites);
  color = adjustBlacks(color, adjustments.blacks);
  color = adjustContrast(color, 1.0 + adjustments.contrast / 100.0);
  color = adjustVibrance(color, adjustments.vibrance / 100.0);
  return adjustSaturation(color, 1.0 + adjustments.saturation / 100.0);
}

// Exposure alone takes only its own step, as the lighter exposure pass does: the full chain rounds even neutral values.
export fn adjustLayer(color: vec3f, adjustments: Adjustments, exposureOnly: bool) -> vec3f {
  if (exposureOnly) {
    return adjustExposure(toWorking(color, adjustments.primaries), adjustments.exposure);
  }
  return adjustColor(color, adjustments);
}
