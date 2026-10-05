// An image at chosen strengths: its encoded light and color differences, each moved toward every
// anchor's by that anchor's share, then decoded. Shares that are all zero give the image exactly.
import { decode, encode, fromOpponent, toOpponent } from "./opponent.wgsl";

// Per anchor, weakest first: its share of light, then of color.
@group(0) @binding(0) var<uniform> shares: array<vec4f, 3>;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var weakLight: texture_2d<f32>;
@group(0) @binding(4) var measuredLight: texture_2d<f32>;
@group(0) @binding(5) var strongLight: texture_2d<f32>;
// Color at half size, sampled between its texels.
@group(0) @binding(6) var weakColor: texture_2d<f32>;
@group(0) @binding(7) var measuredColor: texture_2d<f32>;
@group(0) @binding(8) var strongColor: texture_2d<f32>;

fn toward(value: vec3f, light: f32, color: vec2f, share: vec4f) -> vec3f {
  return vec3f(share.x * (light - value.x), share.y * (color - value.yz));
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let texel = textureLoad(source, p, 0);
  let value = toOpponent(encode(texel.rgb));
  // Each half-size texel averages 2 × 2 pixels, whatever the image's parity.
  let uv = position.xy * 0.5 / vec2f(textureDimensions(weakColor));
  var result = value;
  result += toward(value, textureLoad(weakLight, p, 0).x, textureSampleLevel(weakColor, linearSampler, uv, 0.0).xy, shares[0]);
  result += toward(value, textureLoad(measuredLight, p, 0).x, textureSampleLevel(measuredColor, linearSampler, uv, 0.0).xy, shares[1]);
  result += toward(value, textureLoad(strongLight, p, 0).x, textureSampleLevel(strongColor, linearSampler, uv, 0.0).xy, shares[2]);
  return vec4f(decode(fromOpponent(result)), texel.a);
}
