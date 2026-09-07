import { Transform, sourcePoint } from "./transform.wgsl";

@group(0) @binding(0) var<uniform> transform: Transform;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = sourcePoint(transform, uv);
  if (any(p < vec2f(0.0)) || any(p > vec2f(1.0))) {
    return vec4f(0.0);
  }
  return textureSampleLevel(source, sourceSampler, p, 0.0);
}
