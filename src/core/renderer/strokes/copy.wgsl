// Copies a texture by position, shifted by `offset`; the pass's scissor keeps it to the part it copies.
struct Params {
  offset: vec2f,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return textureLoad(source, vec2i(position.xy + params.offset), 0);
}
