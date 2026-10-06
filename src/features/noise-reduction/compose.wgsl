// Replacement samples for a mosaic at chosen strengths: the decoded samples less part of their
// difference from the reduced ones, in noise deviations per spectrum component, which the
// component's limits and the difference over the 3 × 3 cells around set. Shares of one give the
// reduction, and of zero the decoded samples, exactly.
import { Limits, removed } from "./limit.wgsl";
import { fromSpectrum, Noise, toSpectrum } from "./stabilize.wgsl";

@group(0) @binding(0) var<uniform> noise: Noise;
// Of light, the two color differences, and the greens' difference.
@group(0) @binding(1) var<uniform> limits: Limits;
@group(0) @binding(2) var samples: texture_2d<u32>;
// The reduction's change to each 2 × 2 cell's samples, by position.
@group(0) @binding(3) var reduction: texture_2d<f32>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let cell = vec2i(position.xy);
  let p = cell * 2;
  let decoded = vec4f(
    f32(textureLoad(samples, p, 0).r),
    f32(textureLoad(samples, p + vec2i(1, 0), 0).r),
    f32(textureLoad(samples, p + vec2i(0, 1), 0).r),
    f32(textureLoad(samples, p + vec2i(1, 1), 0).r),
  ) - noise.black;
  let change = textureLoad(reduction, cell, 0);
  // The transform's slope where the reduction puts each sample, so differences count as the filter
  // saw them. Neighbors share it: light varies little between them except at edges, which the
  // difference already marks.
  let a = noise.gain;
  let slope = sqrt(a * max(decoded + change, vec4f(0.0)) + 0.375 * a * a + noise.floor);
  let last = vec2i(textureDimensions(reduction)) - 1;
  var energy = vec4f(0.0);
  for (var i = 0; i < 9; i++) {
    let neighbor = clamp(cell + vec2i(i % 3, i / 3) - 1, vec2i(0), last);
    let difference = toSpectrum(textureLoad(reduction, neighbor, 0) / slope, noise);
    energy += difference * difference;
  }
  let part = removed(toSpectrum(-change / slope, noise), energy / 9.0, limits);
  return decoded - slope * fromSpectrum(part, noise);
}
