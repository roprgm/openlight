import { linearToSrgb, srgbToLinear } from "@vgpu/wgsl-std/color";

// A curve is a table of `size` samples over sRGB-encoded 0..1; input and output remain linear working RGB.
// A module cannot declare the table's binding, so each shader reads the entries `toneSamples` names.

fn position(linear: f32, size: u32) -> f32 {
  return linearToSrgb(clamp(linear, 0.0, 1.0)) * f32(size - 1u);
}

fn neighbors(linear: f32, size: u32) -> vec2u {
  let low = u32(position(linear, size));
  return vec2u(low, min(low + 1u, size - 1u));
}

// Headroom above 1.0 rides on the curve's white endpoint.
fn lookup(linear: f32, samples: vec2f, size: u32) -> f32 {
  return srgbToLinear(mix(samples.x, samples.y, fract(position(linear, size)))) + max(linear - 1.0, 0.0);
}

// The entries `tone` reads: two around the color's lowest channel, then two around its highest.
export fn toneSamples(color: vec3f, size: u32) -> vec4u {
  let low = min(color.r, min(color.g, color.b));
  let high = max(color.r, max(color.g, color.b));
  return vec4u(neighbors(low, size), neighbors(high, size));
}

// Film-like tone mapping: interpolate the middle channel between mapped extremes in linear RGB.
export fn tone(color: vec3f, samples: vec4f, size: u32) -> vec3f {
  let low = min(color.r, min(color.g, color.b));
  let high = max(color.r, max(color.g, color.b));
  let mappedLow = lookup(low, samples.xy, size);
  if (high == low) {
    return vec3f(mappedLow);
  }
  let mappedHigh = lookup(high, samples.zw, size);
  return vec3f(mappedLow) + (color - low) * (mappedHigh - mappedLow) / (high - low);
}
