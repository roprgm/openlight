import { p3ToRec2020, srgbToRec2020 } from "../color.wgsl";

struct Params {
  size: vec2f,
  rotation: u32,
  p3: u32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d<f32>;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Undo `rotation` counter-clockwise quarter turns: where this output pixel sits in the source.
  var p = uv;
  switch (params.rotation) {
    case 1u: { p = vec2f(1.0 - uv.y, uv.x); }
    case 2u: { p = 1.0 - uv; }
    case 3u: { p = vec2f(uv.y, 1.0 - uv.x); }
    default: {}
  }
  let texel = textureLoad(source, vec2i(p * params.size), 0);
  let color = select(srgbToRec2020 * texel.rgb, p3ToRec2020 * texel.rgb, params.p3 == 1u);
  return vec4f(color, texel.a);
}
