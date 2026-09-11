// Adapted from GALOSH (Copyright 2026 luxgrain), Apache-2.0.
// Substantially modified for OpenLight; provenance and changes:
// /licenses/galosh/NOTICE; license: /licenses/galosh/LICENSE.
struct Params { crop: vec4u, black: vec4f, white: f32, grid: vec2u }
@group(0) @binding(0) var source: texture_2d<u32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> statistics: array<vec4f>;
var<workgroup> pixels: array<vec4f, 64>;
var<workgroup> ordered: array<vec4f, 128>;

fn sampleQuad(p: vec2u) -> vec4f {
  var result: vec4f;
  for (var c = 0u; c < 4u; c++) {
    let q = params.crop.xy + p * 2u + vec2u(c & 1u, c >> 1u);
    let phase = (q.y & 1u) * 2u + (q.x & 1u);
    result[c] = (f32(textureLoad(source, vec2i(q), 0).r) - params.black[phase]) / (params.white - params.black[phase]);
  }
  return result;
}

// Robust same-phase second differences reject ramps and isolated edges.
// One sample block per grid cell: at most 32 KiB read back, regardless of megapixels.
@compute @workgroup_size(128)
fn main(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) i: u32) {
  let count = params.crop.zw / 16u;
  let block = min(group.xy * count / params.grid, count - 1u) * 8u;
  if i < 64u { pixels[i] = sampleQuad(block + vec2u(i % 8u, i / 8u)); }
  workgroupBarrier();
  var lap = vec4f(1e20);
  if i < 48u {
    let p = (i / 6u) * 8u + i % 6u;
    lap = abs(pixels[p] - 2.0 * pixels[p + 1u] + pixels[p + 2u]);
  } else if i < 96u {
    let p = i - 48u;
    lap = abs(pixels[p] - 2.0 * pixels[p + 8u] + pixels[p + 16u]);
  }
  ordered[i] = lap;
  workgroupBarrier();
  for (var k = 2u; k <= 128u; k *= 2u) {
    for (var j = k / 2u; j > 0u; j /= 2u) {
      let a = ordered[i];
      let b = ordered[i ^ j];
      let low = ((i & k) == 0u) == ((i & j) == 0u);
      workgroupBarrier();
      ordered[i] = select(max(a, b), min(a, b), low);
      workgroupBarrier();
    }
  }
  if i == 0u {
    var mean = vec4f(0.0);
    for (var p = 0u; p < 64u; p++) { mean += pixels[p] / 64.0; }
    let sigma = 0.5 * (ordered[47] + ordered[48]) / (0.67448975 * sqrt(6.0));
    let index = 2u * (group.y * params.grid.x + group.x);
    statistics[index] = mean;
    statistics[index + 1u] = sigma * sigma;
  }
}
