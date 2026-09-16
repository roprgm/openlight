import { packColor } from "./color.wgsl";
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> grid: vec2u;
@group(0) @binding(2) var<storage, read_write> statistics: array<vec4f>;
var<workgroup> detail: array<vec4f, 64>;
var<workgroup> means: array<vec4f, 64>;
var<workgroup> middle: array<vec4f, 64>;
var<workgroup> valid: array<u32, 64>;

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) lane: u32) {
  // Spaced differences capture noise correlated by demosaic; stride 3 covers every CFA phase.
  let blocks = textureDimensions(source) / 24u;
  let p = vec2i((group.xy * blocks / grid) * 24u + vec2u(lane % 8u, lane / 8u) * 3u);
  let a = packColor(textureLoad(source, p, 0));
  let b = packColor(textureLoad(source, p + vec2i(2, 0), 0));
  let c = packColor(textureLoad(source, p + vec2i(0, 2), 0));
  let d = packColor(textureLoad(source, p + vec2i(2, 2), 0));
  let opaque = min(min(a.a, b.a), min(c.a, d.a)) >= 1.0;
  let contrast = select(vec4f(1e20), abs((a - b - c + d) * 0.5), opaque);
  detail[lane] = contrast;
  means[lane] = select(vec4f(0.0), (a + b + c + d) * 0.25, opaque);
  valid[lane] = select(0u, 1u, opaque);
  workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride /= 2u) {
    if lane < stride { valid[lane] += valid[lane + stride]; }
    workgroupBarrier();
  }
  var rank = vec4u(0);
  for (var k = 0u; k < 64u; k++) {
    rank += select(vec4u(0), vec4u(1), (detail[k] < contrast) | ((detail[k] == contrast) & vec4<bool>(k < lane)));
  }
  middle[lane] = select(vec4f(0.0), contrast, rank == vec4u(valid[0] / 2u));
  workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride /= 2u) {
    if lane < stride { means[lane] += means[lane + stride]; middle[lane] += middle[lane + stride]; }
    workgroupBarrier();
  }
  if lane == 0u {
    let sigma = middle[0] / 0.6744897501960817;
    let index = (group.y * grid.x + group.x) * 2u;
    statistics[index] = means[0] / f32(max(valid[0], 1u));
    statistics[index + 1u] = select(vec4f(-1.0), sigma * sigma, valid[0] >= 16u);
  }
}
