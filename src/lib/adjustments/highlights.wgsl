import { linearToSrgb } from "@vgpu/wgsl-std/color";
import { luminance } from "../color.wgsl";

fn highlightCompression(tone: f32) -> f32 {
  let mask = smoothstep(0.0, 0.25, tone);
  let curve = 0.5 + tone * (1.0 - tone) *
    (-0.89 + tone * (-1.1 + tone * 6.44));
  let tail = smoothstep(0.95, 1.0, tone);
  return mask * curve - 0.2 * tail * tail * tail;
}

export fn adjustHighlights(color: vec3f, amount: f32) -> vec3f {
  if amount == 0.0 { return color; }
  let light = clamp(luminance(color), 0.0, 1.0);
  let strength = abs(amount) / 100.0;
  if amount < 0.0 {
    let tone = linearToSrgb(light);
    let gain = exp2(-highlightCompression(tone));
    // Preserve more chroma in bright colors, without clipping to a display gamut.
    let chroma = pow(gain, 1.0 - 0.76 * smoothstep(0.5, 1.0, tone));
    let gray = vec3f(luminance(color));
    let endpoint = gray * gain + (color - gray) * chroma;
    return mix(color, endpoint, strength);
  }
  // Positive endpoint still fitted only to fixture ramps.
  let mask = smoothstep(0.0, 0.175, linearToSrgb(light));
  let curve = 0.38 + 2.42 * light * light;
  let stops = mask * curve;
  // Limit of the shoulder near black avoids subtraction cancellation.
  if light < 0.0001 { return color * mix(1.0, exp2(stops), strength); }
  let mapped = 1.0 - pow(1.0 - light, exp2(stops));
  return color * mix(1.0, mapped / light, strength);
}
