// An image at chosen strengths: its encoded light and color differences less part of their difference
// from the reduction's, in noise deviations, which the limits of light and color and the difference
// over the 3 × 3 pixels around set; then decoded, and dithered when the output keeps 8 bits, so
// smooth reductions don't band.
import { Limits, removed } from "./limit.wgsl";
import { decode, encode, fromOpponent, toOpponent } from "./opponent.wgsl";

struct Params {
  // The noise deviation of each pixel's light and two color differences.
  noise: vec4f,
  // The output's step in the encoding, or 0 when it keeps floats.
  quantum: f32,
}

// Of light and the two color differences.
@group(0) @binding(0) var<uniform> limits: Limits;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var source: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var light: texture_2d<f32>;
// Color at half size, sampled between its texels.
@group(0) @binding(5) var color: texture_2d<f32>;

// Uniform in [-0.5, 0.5), from a hash of the pixel's position (PCG, Jarzynski and Olano, 2020).
fn dither(p: vec2u) -> f32 {
  var state = p.x * 747796405u + p.y * 2891336453u + 2891336453u;
  state = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return f32((state >> 22u) ^ state) / 4294967296.0 - 0.5;
}

struct Pixel {
  value: vec3f,
  // The difference from the reduction, in noise deviations.
  difference: vec3f,
}

fn pixelAt(at: vec2i) -> Pixel {
  let p = clamp(at, vec2i(0), vec2i(textureDimensions(source)) - 1);
  let value = toOpponent(encode(textureLoad(source, p, 0).rgb));
  // Each half-size texel averages 2 × 2 pixels, whatever the image's parity.
  let uv = (vec2f(p) + 0.5) * 0.5 / vec2f(textureDimensions(color));
  let reduced = vec3f(textureLoad(light, p, 0).x, textureSampleLevel(color, linearSampler, uv, 0.0).xy);
  return Pixel(value, (value - reduced) / params.noise.xyz);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let center = vec2i(position.xy);
  let pixel = pixelAt(center);
  var energy = pixel.difference * pixel.difference;
  for (var i = 0; i < 9; i++) {
    let offset = vec2i(i % 3, i / 3) - 1;
    if (any(offset != vec2i(0))) {
      let difference = pixelAt(center + offset).difference;
      energy += difference * difference;
    }
  }
  let part = removed(vec4f(pixel.difference, 0.0), vec4f(energy / 9.0, 0.0), limits).xyz;
  let result = fromOpponent(pixel.value - params.noise.xyz * part);
  return vec4f(decode(result + dither(vec2u(center)) * params.quantum), textureLoad(source, center, 0).a);
}
