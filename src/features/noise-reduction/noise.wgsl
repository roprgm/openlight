// Noise statistics of a Bayer mosaic: for each block of 32 × 32 sensor pixels, each 2 × 2 cell
// position's mean above black and the variance of its diagonal Haar detail, which flat blocks owe to
// noise alone. A position with a clipped sample in the block reports a negative variance, which the
// fit skips.
const side = 8u;

struct Params {
  black: vec4f,
  white: f32,
}

@group(0) @binding(0) var samples: texture_2d<u32>;
@group(0) @binding(1) var<uniform> params: Params;
// Per block: the four positions' means, then their variances.
@group(0) @binding(2) var<storage, read_write> blocks: array<vec4f>;

var<workgroup> means: array<vec4f, 64>;
var<workgroup> details: array<vec4f, 64>;
var<workgroup> clipped: array<vec4u, 64>;

// The 2 × 2 cell at `cell`, one sample per position, above black.
fn cell(cell: vec2u) -> vec4f {
  let p = vec2i(cell * 2u);
  return vec4f(
    f32(textureLoad(samples, p, 0).r),
    f32(textureLoad(samples, p + vec2i(1, 0), 0).r),
    f32(textureLoad(samples, p + vec2i(0, 1), 0).r),
    f32(textureLoad(samples, p + vec2i(1, 1), 0).r),
  ) - params.black;
}

@compute @workgroup_size(side, side) fn measure(
  @builtin(workgroup_id) block: vec3u,
  @builtin(local_invocation_id) local: vec3u,
  @builtin(local_invocation_index) thread: u32,
  @builtin(num_workgroups) blocks_: vec3u,
) {
  // Each thread takes 2 × 2 cells: their mean and their diagonal detail, (a - b - c + d) / 2.
  let origin = (block.xy * side + local.xy) * 2u;
  let a = cell(origin);
  let b = cell(origin + vec2u(1u, 0u));
  let c = cell(origin + vec2u(0u, 1u));
  let d = cell(origin + vec2u(1u, 1u));
  let detail = (a - b - c + d) * 0.5;
  means[thread] = (a + b + c + d) * 0.25;
  details[thread] = detail * detail;
  let top = max(max(a, b), max(c, d)) + params.black;
  clipped[thread] = vec4u(top >= vec4f(params.white));
  workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride /= 2u) {
    if (thread < stride) {
      means[thread] += means[thread + stride];
      details[thread] += details[thread + stride];
      clipped[thread] = max(clipped[thread], clipped[thread + stride]);
    }
    workgroupBarrier();
  }
  if (thread == 0u) {
    let index = (block.y * blocks_.x + block.x) * 2u;
    blocks[index] = means[0] / 64.0;
    blocks[index + 1u] = select(details[0] / 64.0, vec4f(-1.0), clipped[0] != vec4u(0u));
  }
}
