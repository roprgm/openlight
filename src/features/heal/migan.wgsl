import { patchCoverage } from "./coverage.wgsl";

struct Params {
  origin: vec2f,
  extent: vec2f,
  maskOrigin: vec2f,
  maskExtent: vec2f,
  dimensions: vec2f,
  feather: f32,
  opacity: f32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var result: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = position.xy * params.dimensions / vec2f(textureDimensions(source));
  let original = textureSampleLevel(source, linearSampler, p / params.dimensions, 0.0);
  if (any(p < params.maskOrigin) || any(p > params.maskOrigin + params.maskExtent)) {
    return original;
  }
  let amount = patchCoverage(coverage, linearSampler, p, params.dimensions, params.feather) * params.opacity;
  let uv = (p - params.origin) / params.extent;
  if (amount == 0.0 || any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
    return original;
  }
  let generated = textureSampleLevel(result, linearSampler, uv, 0.0);
  return vec4f(mix(original.rgb, generated.rgb, amount), original.a);
}
