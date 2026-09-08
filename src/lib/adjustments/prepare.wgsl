import { luminance } from "../color.wgsl";

export struct Adjustments {
  exposure: f32,
  incrementalTemperature: f32,
  incrementalTint: f32,
  contrast: f32,
  highlights: f32,
  shadows: f32,
  whites: f32,
  blacks: f32,
  vibrance: f32,
  saturation: f32,
}

// Source preparation in linear Rec.2020; retain the calibrated constants.

// Fitted exposure of a gray level. Light above 1.0 is headroom and scales linearly with the stops.
fn exposeGray(light: f32, stops: f32) -> f32 {
  let bounded = min(light, 1.0);
  let headroom = (light - bounded) * exp2(stops);
  if stops < 0.0 {
    return headroom + exp2(stops * 1.09) * pow(bounded, exp2(-stops * 0.14));
  }
  let gain = mix(vec2f(1.11, -0.11) * min(stops, 1.0), vec2f(4.05, -0.63), max(stops - 1.0, 0.0) / 4.0);
  return headroom + 1.0 - pow(1.0 - pow(bounded, exp2(gain.y)), exp2(gain.x));
}

// Every channel scales by the gain of the pixel's luminance, so hue holds at any exposure.
// Negatives, from wide-gamut sources or noise below black, clip here.
fn adjustExposure(color: vec3f, stops: f32) -> vec3f {
  let clipped = max(color, vec3f(0.0));
  let light = luminance(clipped);
  if light <= 0.0 { return clipped; }
  return clipped * (exposeGray(light, stops) / light);
}

fn adjustWhiteBalance(color: vec3f, temperature: f32, tint: f32) -> vec3f {
  let warmth = vec3f(2.50, 1.19, -1.89) * temperature
    + (vec3f(1.55, 1.89, 2.93) + vec3f(-1.47, -1.05, -0.69) * temperature) * abs(temperature);
  let tintGain = (vec3f(0.53, -0.59, 1.02) + vec3f(0.64, 0.94, 1.35) * tint) * tint;
  let gain = warmth + tintGain;
  // The fitted response covers 0..1; headroom above it passes through unchanged.
  let bounded = min(color, vec3f(1.0));
  return bounded / (bounded + (1.0 - bounded) * exp2(-gain)) + (color - bounded);
}

export fn prepareColor(color: vec3f, adjustments: Adjustments) -> vec3f {
  return adjustWhiteBalance(adjustExposure(color, adjustments.exposure),
    adjustments.incrementalTemperature / 100.0, adjustments.incrementalTint / 100.0);
}
