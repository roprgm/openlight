struct Params {
  origin: vec2f,
  dimensions: vec2f,
  coverageOrigin: vec2f,
  coverageSize: vec2f,
  scale: f32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = params.origin + position.xy * params.scale;
  let footprint = max(1.0, params.scale * 0.5);
  var masked = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let q = p + vec2f(f32(x), f32(y)) * footprint;
      let uv = (q - params.coverageOrigin) / params.coverageSize;
      if (all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0))) {
        masked = max(masked, textureSampleLevel(coverage, linearSampler, uv, 0.0).r);
      }
    }
  }
  let color = textureSampleLevel(source, linearSampler, p / params.dimensions, 0.0).rgb;
  return vec4f(select(log(vec3f(1.0) + max(color, vec3f(0.0))), vec3f(0.0), masked > 0.001), select(0.0, 1.0, masked > 0.001));
}
