// Halves the spectrum by averaging each 2 × 2 block, which halves its noise; past an odd edge the last
// texel repeats.
import { pack, unpack } from "./texels.wgsl";

struct Sizes {
  source: vec2u,
  output: vec2u,
}

@group(0) @binding(0) var<uniform> sizes: Sizes;
@group(0) @binding(1) var<storage, read> source: array<vec2u>;
@group(0) @binding(2) var<storage, read_write> output: array<vec2u>;

fn load(p: vec2u) -> vec4f {
  let q = min(p, sizes.source - 1u);
  return unpack(source[q.y * sizes.source.x + q.x]);
}

@compute @workgroup_size(8, 8) fn down(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= sizes.output)) {
    return;
  }
  let p = id.xy * 2u;
  let sum = load(p) + load(p + vec2u(1u, 0u)) + load(p + vec2u(0u, 1u)) + load(p + 1u);
  output[id.y * sizes.output.x + id.x] = pack(sum * 0.25);
}
