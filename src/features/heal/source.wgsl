struct Params { size: vec2f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
  return textureSampleLevel(source, linearSampler, p.xy / params.size, 0.0);
}
