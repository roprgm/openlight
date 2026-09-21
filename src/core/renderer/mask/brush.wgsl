// One brush's rasterized coverage scaled by its strength; the pass blend adds or subtracts it from its group.
struct Params {
  opacity: f32,
}
@group(0) @binding(0) var coverage: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let value = textureLoad(coverage, vec2i(position.xy), 0).r;
  return vec4f(value * params.opacity, 0.0, 0.0, 1.0);
}
