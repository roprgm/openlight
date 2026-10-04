import { toWorking } from "../../core/image/color.wgsl";

export struct Adjustments {
  // The primaries the input is in, as toWorking numbers them: the image layer's pass converts an 8-bit source.
  primaries: u32,
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

// Exposure scales linear light, including values outside the display range, so opposite stops cancel.
export fn adjustExposure(color: vec3f, stops: f32) -> vec3f {
  return color * exp2(stops);
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
  let working = toWorking(color, adjustments.primaries);
  return adjustWhiteBalance(adjustExposure(working, adjustments.exposure),
    adjustments.incrementalTemperature / 100.0, adjustments.incrementalTint / 100.0);
}
