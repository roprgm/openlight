import { patchCoverage } from "../coverage.wgsl";
struct Params {
  origin: vec2f, extent: vec2f, dimensions: vec2f, grid: vec2f,
  coverageOrigin: vec2f, coverageSize: vec2f, feather: f32, opacity: f32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var filled: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = position.xy / params.grid * params.dimensions;
  let original = textureSampleLevel(source, linearSampler, p / params.dimensions, 0.0);
  let uv = (p - params.coverageOrigin) / params.coverageSize;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return original; }
  let hard = textureSampleLevel(coverage, linearSampler, uv, 0.0).r;
  if (hard == 0.0) { return original; }
  let feathered = patchCoverage(coverage, linearSampler, p - params.coverageOrigin, params.coverageSize, params.feather);
  let replacement = textureSampleLevel(filled, linearSampler, (p - params.origin) / params.extent, 0.0);
  return vec4f(mix(original.rgb, replacement.rgb, feathered * params.opacity * replacement.a), original.a);
}
