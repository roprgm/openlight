// Replaces an estimate's low frequencies with those of the half-size spectrum's estimate, whose
// patches were large enough to tell broad noise from the image: the estimate plus the upsampled
// difference between that coarser estimate and the estimate's own 2 × 2 averages (after Pierazzo,
// Morel, and Facciolo, 2017), blurred so the coarser estimate's finest frequencies, where its patches
// ring at edges, stay out. Where the two agree, the estimate stays whole. Separable, across rows into
// `across`, then down columns into `output`.
import { pack, unpack } from "./texels.wgsl";

struct Sizes {
  fine: vec2u,
  coarse: vec2u,
}

// A Gaussian of 1.25 texels, normalized over its nine taps.
const taps = array<f32, 5>(0.3192, 0.2318, 0.0888, 0.0179, 0.0019);

@group(0) @binding(0) var<uniform> sizes: Sizes;
@group(0) @binding(1) var<storage, read> fine: array<vec2u>;
// The fine estimate's 2 × 2 averages, and the coarser scale's estimate.
@group(0) @binding(2) var<storage, read> average: array<vec2u>;
@group(0) @binding(3) var<storage, read> coarse: array<vec2u>;
@group(0) @binding(4) var<storage, read_write> across: array<vec2u>;
@group(0) @binding(5) var<storage, read_write> output: array<vec2u>;

fn coarseAt(p: vec2i) -> vec4f {
  let q = vec2u(clamp(p, vec2i(0), vec2i(sizes.coarse) - 1));
  let index = q.y * sizes.coarse.x + q.x;
  return unpack(coarse[index]) - unpack(average[index]);
}

// The coarser estimate less the fine one's averages, upsampled to `p`; bilinear, each coarse texel
// centered on the 2 × 2 block it averages.
fn difference(p: vec2i) -> vec4f {
  let q = clamp(p, vec2i(0), vec2i(sizes.fine) - 1);
  let position = vec2f(q) * 0.5 - 0.25;
  let base = vec2i(floor(position));
  let f = position - floor(position);
  let top = mix(coarseAt(base), coarseAt(base + vec2i(1, 0)), f.x);
  let bottom = mix(coarseAt(base + vec2i(0, 1)), coarseAt(base + 1), f.x);
  return mix(top, bottom, f.y);
}

@compute @workgroup_size(8, 8) fn blurRows(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= sizes.fine)) {
    return;
  }
  let p = vec2i(id.xy);
  var sum = taps[0] * difference(p);
  for (var k = 1; k < 5; k++) {
    sum += taps[k] * (difference(p - vec2i(k, 0)) + difference(p + vec2i(k, 0)));
  }
  across[id.y * sizes.fine.x + id.x] = pack(sum);
}

fn acrossAt(p: vec2i) -> vec4f {
  let q = vec2u(clamp(p, vec2i(0), vec2i(sizes.fine) - 1));
  return unpack(across[q.y * sizes.fine.x + q.x]);
}

@compute @workgroup_size(8, 8) fn blurColumns(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= sizes.fine)) {
    return;
  }
  let p = vec2i(id.xy);
  var sum = taps[0] * acrossAt(p);
  for (var k = 1; k < 5; k++) {
    sum += taps[k] * (acrossAt(p - vec2i(0, k)) + acrossAt(p + vec2i(0, k)));
  }
  let index = id.y * sizes.fine.x + id.x;
  output[index] = pack(unpack(fine[index]) + sum);
}
