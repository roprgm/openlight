// Draws a band of uploaded rows into a raster, byte for byte; the pass's scissor keeps it to the band.
struct Params {
  top: f32,
}
@group(0) @binding(0) var band: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return textureLoad(band, vec2i(position.xy - vec2f(0.0, params.top)), 0);
}
