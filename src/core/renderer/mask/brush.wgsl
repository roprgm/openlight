// One brush's rasterized coverage scaled by its strength; the pass blend adds or subtracts it from its group.
struct Params {
  opacity: f32,
  // Where the brush's raster starts in the group, which spans the whole source.
  origin: vec2f,
}
@group(0) @binding(0) var coverage: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let texel = vec2i(position.xy - params.origin);
  if (any(texel < vec2i(0)) || any(texel >= vec2i(textureDimensions(coverage)))) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let value = textureLoad(coverage, texel, 0).r;
  return vec4f(value * params.opacity, 0.0, 0.0, 1.0);
}
