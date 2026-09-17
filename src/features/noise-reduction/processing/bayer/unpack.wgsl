import { unstabilize, opponent } from "./variance.wgsl";
struct Params { black: vec4f, white: f32, shot: vec4f, read: vec4f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4u {
  let p = vec2u(position.xy);
  let phase = (p.y & 1u) * 2u + (p.x & 1u);
  let samples = unstabilize(opponent(textureLoad(source, vec2i(p / 2u), 0)), params.shot, params.read);
  let code = samples[phase] * (params.white - params.black[phase]) + params.black[phase];
  // Return sensor codes, including values below black and above nominal white.
  return vec4u(u32(round(clamp(code, 0.0, 65535.0))), 0u, 0u, 1u);
}
