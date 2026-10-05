// Replacement samples for a mosaic at chosen strengths: the decoded samples plus each anchor's
// change, split into the spectrum's components and weighed by that anchor's share of each. The
// split follows the transform's slope where the strongest anchor puts each sample, so changes divide
// as the filter saw them, and shares that are all one or all zero give an anchor or the decoded
// samples exactly.
import { fromSpectrum, Noise, toSpectrum } from "./stabilize.wgsl";

@group(0) @binding(0) var<uniform> noise: Noise;
// Per anchor, weakest first: its share of light, the two color differences, and the greens' one.
@group(0) @binding(1) var<uniform> shares: array<vec4f, 3>;
@group(0) @binding(2) var samples: texture_2d<u32>;
@group(0) @binding(3) var weak: texture_2d<f32>;
@group(0) @binding(4) var measured: texture_2d<f32>;
@group(0) @binding(5) var strong: texture_2d<f32>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let cell = vec2i(position.xy);
  let p = cell * 2;
  let decoded = vec4f(
    f32(textureLoad(samples, p, 0).r),
    f32(textureLoad(samples, p + vec2i(1, 0), 0).r),
    f32(textureLoad(samples, p + vec2i(0, 1), 0).r),
    f32(textureLoad(samples, p + vec2i(1, 1), 0).r),
  ) - noise.black;
  let changes = array<vec4f, 3>(
    textureLoad(weak, cell, 0),
    textureLoad(measured, cell, 0),
    textureLoad(strong, cell, 0),
  );
  let a = noise.gain;
  let settled = max(decoded + changes[2], vec4f(0.0));
  let slope = sqrt(a * settled + 0.375 * a * a + noise.floor);
  var result = decoded;
  for (var k = 0; k < 3; k++) {
    result += slope * fromSpectrum(shares[k] * toSpectrum(changes[k] / slope, noise), noise);
  }
  return result;
}
