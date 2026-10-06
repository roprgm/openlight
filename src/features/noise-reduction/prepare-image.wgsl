// An image's pixels as the filter's spectra at half size, from the light and two color differences of
// its encoded color: each 2 × 2 cell's light by its Haar transform, or its color differences, summed
// orthonormally so noise keeps its deviation. A last odd row or column repeats the one before.
import { encode, haar, toOpponent } from "./opponent.wgsl";
import { pack } from "./texels.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> size: vec2u;
@group(0) @binding(2) var<storage, read_write> output: array<vec2u>;

fn opponentAt(p: vec2u) -> vec3f {
  let q = min(p, textureDimensions(source) - 1u);
  return toOpponent(encode(textureLoad(source, q, 0).rgb));
}

@compute @workgroup_size(8, 8) fn light(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= size)) {
    return;
  }
  let p = id.xy * 2u;
  let cell = vec4f(
    opponentAt(p).x,
    opponentAt(p + vec2u(1u, 0u)).x,
    opponentAt(p + vec2u(0u, 1u)).x,
    opponentAt(p + 1u).x,
  );
  output[id.y * size.x + id.x] = pack(haar * cell);
}

@compute @workgroup_size(8, 8) fn color(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= size)) {
    return;
  }
  let p = id.xy * 2u;
  let sum = opponentAt(p).yz + opponentAt(p + vec2u(1u, 0u)).yz + opponentAt(p + vec2u(0u, 1u)).yz + opponentAt(p + 1u).yz;
  output[id.y * size.x + id.x] = pack(vec4f(sum * 0.5, 0.0, 0.0));
}
