// Independent Haar HH statistics: each coefficient has unit noise energy.
// Median absolute coefficients estimate each physical Bayer phase independently.
struct Params { crop: vec4u, black: vec4f, white: f32, grid: vec2u }
@group(0) @binding(0) var source: texture_2d<u32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> statistics: array<vec4f>;
var<workgroup> detail: array<vec4f, 64>;
var<workgroup> means: array<vec4f, 64>;
var<workgroup> middle: array<vec4f, 64>;

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) lane: u32) {
  let blocks = params.crop.zw / 32u;
  let origin = params.crop.xy + (group.xy * blocks / params.grid) * 32u;
  let cell = origin + vec2u(lane % 8u, lane / 8u) * 4u;
  var average: vec4f;
  var contrast: vec4f;
  for (var channel = 0u; channel < 4u; channel++) {
    let p = cell + vec2u(channel & 1u, channel >> 1u);
    let phase = (p.y & 1u) * 2u + (p.x & 1u);
    let scale = params.white - params.black[phase];
    let a = f32(textureLoad(source, vec2i(p), 0).r);
    let b = f32(textureLoad(source, vec2i(p + vec2u(2, 0)), 0).r);
    let c = f32(textureLoad(source, vec2i(p + vec2u(0, 2)), 0).r);
    let d = f32(textureLoad(source, vec2i(p + vec2u(2, 2)), 0).r);
    average[channel] = ((a + b + c + d) * 0.25 - params.black[phase]) / scale;
    contrast[channel] = abs((a - b - c + d) * 0.5 / scale);
  }
  means[lane] = average;
  detail[lane] = contrast;
  workgroupBarrier();
  // Select median ranks with deterministic tie breaking across the 64 coefficients.
  var rank = vec4u(0);
  for (var k = 0u; k < 64u; k++) {
    rank += select(vec4u(0), vec4u(1), (detail[k] < contrast) | ((detail[k] == contrast) & vec4<bool>(k < lane)));
  }
  middle[lane] = select(vec4f(0.0), contrast, (rank == vec4u(31)) | (rank == vec4u(32)));
  workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride /= 2u) {
    if lane < stride {
      means[lane] += means[lane + stride];
      middle[lane] += middle[lane + stride];
    }
    workgroupBarrier();
  }
  if lane == 0u {
    let sigma = middle[0] * 0.5 / 0.6744897501960817;
    let index = (group.y * params.grid.x + group.x) * 2u;
    statistics[index] = means[0] / 64.0;
    statistics[index + 1u] = sigma * sigma;
  }
}
