// Moves a raster's content into its replacement; `offset` is where the old texture starts in the new one.
struct Params {
  offset: vec2f,
}
@group(0) @binding(0) var previous: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return textureLoad(previous, vec2i(position.xy - params.offset), 0);
}
