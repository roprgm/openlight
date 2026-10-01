struct Params { base: f32, strength: f32 }
@group(0) @binding(0) var base: texture_2d<f32>;
@group(0) @binding(1) var added: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let first = min(vec2i(uv * vec2f(textureDimensions(base))), vec2i(textureDimensions(base)) - 1);
  let second = min(vec2i(uv * vec2f(textureDimensions(added))), vec2i(textureDimensions(added)) - 1);
  let coverage = textureLoad(base, first, 0).r * params.base + textureLoad(added, second, 0).r * params.strength;
  return vec4f(clamp(coverage, 0.0, 1.0), 0.0, 0.0, 1.0);
}
