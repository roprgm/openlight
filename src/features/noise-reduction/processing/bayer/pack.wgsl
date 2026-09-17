import { stabilize, opponent } from "./variance.wgsl";
struct Params { crop: vec4u, black: vec4f, white: f32, shot: vec4f, read: vec4f }
@group(0) @binding(0) var source: texture_2d<u32>;
@group(0) @binding(1) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let origin = vec2u(position.xy) * 2u;
  var values: vec4f;
  for (var c = 0u; c < 4u; c++) {
    let offset = vec2u(c & 1u, c >> 1u);
    let local = min(origin + offset, params.crop.zw - 1u - ((params.crop.zw - 1u - offset) & vec2u(1u)));
    let p = params.crop.xy + local;
    let phase = (p.y & 1u) * 2u + (p.x & 1u);
    values[c] = (f32(textureLoad(source, vec2i(p), 0).r) - params.black[phase]) / (params.white - params.black[phase]);
  }
  return opponent(stabilize(values, params.shot, params.read));
}
