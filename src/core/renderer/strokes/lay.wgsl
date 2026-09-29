// Lays a paint stroke's coverage over its raster in the stroke's color, premultiplied, or erases by it,
// in one pass, so the stroke rounds to the raster's 8 bits once rather than at every dab.
struct Params {
  color: vec3f,
}
@group(0) @binding(0) var coverage: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let value = textureLoad(coverage, vec2i(position.xy), 0).r;
  return vec4f(params.color * value, value);
}
