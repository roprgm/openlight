struct Params {
  size: vec2f,
  rotation: u32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d<f32>;

// Lays the staged image out: cropped to its size, undoing `rotation` counter-clockwise quarter turns.
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var p = uv;
  switch (params.rotation) {
    case 1u: { p = vec2f(1.0 - uv.y, uv.x); }
    case 2u: { p = 1.0 - uv; }
    case 3u: { p = vec2f(uv.y, 1.0 - uv.x); }
    default: {}
  }
  return textureLoad(source, vec2i(p * params.size), 0);
}
