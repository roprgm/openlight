// An image's pixels as the filter's spectrum: light and two color differences of the encoded color.
import { encode, toOpponent } from "./opponent.wgsl";
import { pack } from "./texels.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> size: vec2u;
@group(0) @binding(2) var<storage, read_write> output: array<vec2u>;

@compute @workgroup_size(8, 8) fn prepare(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= size)) {
    return;
  }
  let rgb = textureLoad(source, id.xy, 0).rgb;
  output[id.y * size.x + id.x] = pack(vec4f(toOpponent(encode(rgb)), 0.0));
}
