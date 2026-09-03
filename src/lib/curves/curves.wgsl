import { linearToSrgb, srgbToLinear } from "@vgpu/wgsl-std/color";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> curve: array<f32>;

// The graph uses sRGB transfer; input and output remain linear working RGB.
fn lookup(linear: f32) -> f32 {
  let last = arrayLength(&curve) - 1u;
  let position = clamp(linearToSrgb(linear), 0.0, 1.0) * f32(last);
  let lo = u32(position);
  return srgbToLinear(mix(curve[lo], curve[min(lo + 1u, last)], fract(position)));
}

// Film-like tone mapping: interpolate the middle channel between mapped extremes in linear RGB.
fn tone(color: vec3f) -> vec3f {
  let low = min(color.r, min(color.g, color.b));
  let high = max(color.r, max(color.g, color.b));
  let mappedLow = lookup(low);
  if (high == low) {
    return vec3f(mappedLow);
  }
  let mappedHigh = lookup(high);
  return vec3f(mappedLow) + (color - low) * (mappedHigh - mappedLow) / (high - low);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  return vec4f(tone(clamp(input.rgb, vec3f(0.0), vec3f(1.0))), input.a);
}
