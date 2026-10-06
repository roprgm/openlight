// Replaces an estimate's low frequencies with those of the half-size spectrum's estimate, whose
// patches were large enough to tell broad noise from the image (after Pierazzo, Morel, and Facciolo,
// 2017): the difference between that coarser estimate and the estimate's own 2 × 2 averages,
// blurred at the coarse size so the coarser patches' finest frequencies, which ring at edges, stay
// out, then upsampled and added. Where the two levels agree, the estimate stays whole.
import { pack, unpack } from "./texels.wgsl";

struct Sizes {
  fine: vec2u,
  coarse: vec2u,
}

// A Gaussian of 0.625 coarse texels, 1.25 fine ones, normalized over its five taps.
const taps = array<f32, 3>(0.6377, 0.1773, 0.0038);

@group(0) @binding(0) var<uniform> sizes: Sizes;
@group(0) @binding(1) var<storage, read> fine: array<vec2u>;
// The fine estimate's 2 × 2 averages, and the coarser level's estimate.
@group(0) @binding(2) var<storage, read> average: array<vec2u>;
@group(0) @binding(3) var<storage, read> coarse: array<vec2u>;
// The difference blurred across rows, then down columns, at the coarse size.
@group(0) @binding(4) var<storage, read_write> across: array<vec2u>;
@group(0) @binding(5) var<storage, read_write> blurred: array<vec2u>;
@group(0) @binding(6) var<storage, read_write> output: array<vec2u>;

fn coarseIndex(p: vec2i) -> u32 {
  let q = vec2u(clamp(p, vec2i(0), vec2i(sizes.coarse) - 1));
  return q.y * sizes.coarse.x + q.x;
}

fn difference(p: vec2i) -> vec4f {
  let index = coarseIndex(p);
  return unpack(coarse[index]) - unpack(average[index]);
}

@compute @workgroup_size(8, 8) fn blurRows(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= sizes.coarse)) {
    return;
  }
  let p = vec2i(id.xy);
  var sum = taps[0] * difference(p);
  for (var k = 1; k < 3; k++) {
    sum += taps[k] * (difference(p - vec2i(k, 0)) + difference(p + vec2i(k, 0)));
  }
  across[coarseIndex(p)] = pack(sum);
}

@compute @workgroup_size(8, 8) fn blurColumns(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= sizes.coarse)) {
    return;
  }
  let p = vec2i(id.xy);
  var sum = taps[0] * unpack(across[coarseIndex(p)]);
  for (var k = 1; k < 3; k++) {
    sum += taps[k] * (unpack(across[coarseIndex(p - vec2i(0, k))]) + unpack(across[coarseIndex(p + vec2i(0, k))]));
  }
  blurred[coarseIndex(p)] = pack(sum);
}

fn blurredAt(p: vec2i) -> vec4f {
  return unpack(blurred[coarseIndex(p)]);
}

// The estimate plus the blurred difference, bilinear, each coarse texel centered on the 2 × 2 block
// it averages.
@compute @workgroup_size(8, 8) fn add(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= sizes.fine)) {
    return;
  }
  let position = vec2f(id.xy) * 0.5 - 0.25;
  let base = vec2i(floor(position));
  let f = position - floor(position);
  let top = mix(blurredAt(base), blurredAt(base + vec2i(1, 0)), f.x);
  let bottom = mix(blurredAt(base + vec2i(0, 1)), blurredAt(base + 1), f.x);
  let index = id.y * sizes.fine.x + id.x;
  output[index] = pack(unpack(fine[index]) + mix(top, bottom, f.y));
}
