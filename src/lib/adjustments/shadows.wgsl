import { linearToSrgb, srgbToLinear } from "@vgpu/wgsl-std/color";
import { luminance } from "../color.wgsl";

fn liftedShadow(tone: f32) -> f32 {
  let inverse = 1.0 - tone;
  let shape = 0.95 + tone * (-3.0 + 3.28 * tone);
  return tone + sqrt(tone) * inverse * inverse * shape;
}

fn crushedShadow(tone: f32) -> f32 {
  let shape = -2.21 + tone * (6.91 - 7.12 * tone);
  return tone + pow(tone, 1.25) * pow(1.0 - tone, 2.25) * shape;
}

export fn adjustShadows(color: vec3f, amount: f32) -> vec3f {
  if amount == 0.0 { return color; }
  let light = clamp(luminance(color), 0.0, 1.0);
  if light == 0.0 { return color; }
  let tone = linearToSrgb(light);
  let endpointStrength = select(1.0, 0.25, amount > 0.0);
  let strength = abs(amount) / 100.0 * endpointStrength;
  let mappedTone = select(crushedShadow(tone), liftedShadow(tone), amount > 0.0);
  let gain = srgbToLinear(mappedTone) / light;
  return color * mix(1.0, gain, strength);
}
