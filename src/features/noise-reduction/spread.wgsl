// The noise left in one level of the spectrum: for each block of 16 × 16 texels, the variance of each
// component's diagonal Haar detail, which flat blocks owe to noise alone.
import { unpack } from "./texels.wgsl";

const side = 8u;

@group(0) @binding(0) var<uniform> size: vec2u;
@group(0) @binding(1) var<storage, read> spectrum: array<vec2u>;
@group(0) @binding(2) var<storage, read_write> blocks: array<vec4f>;

var<workgroup> details: array<vec4f, 64>;

fn load(p: vec2u) -> vec4f {
  return unpack(spectrum[p.y * size.x + p.x]);
}

@compute @workgroup_size(side, side) fn measure(
  @builtin(workgroup_id) block: vec3u,
  @builtin(local_invocation_id) local: vec3u,
  @builtin(local_invocation_index) thread: u32,
  @builtin(num_workgroups) count: vec3u,
) {
  let p = (block.xy * side + local.xy) * 2u;
  let detail = (load(p) - load(p + vec2u(1u, 0u)) - load(p + vec2u(0u, 1u)) + load(p + 1u)) * 0.5;
  details[thread] = detail * detail;
  workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride /= 2u) {
    if (thread < stride) {
      details[thread] += details[thread + stride];
    }
    workgroupBarrier();
  }
  if (thread == 0u) {
    blocks[block.y * count.x + block.x] = details[0] / 64.0;
  }
}
