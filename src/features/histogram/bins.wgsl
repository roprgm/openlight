import { display } from "../../lib/color.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
// 256 bins per channel, then the peak of the interior bins for scaling the chart.
@group(0) @binding(1) var<storage, read_write> bins: array<atomic<u32>, 769>;

const samples = vec2u(512, 320);

fn count(channel: u32, bin: u32) {
  let n = atomicAdd(&bins[channel * 256u + bin], 1u) + 1u;
  if (bin > 0u && bin < 255u) {
    atomicMax(&bins[768], n);
  }
}

@compute @workgroup_size(16, 16) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= samples)) {
    return;
  }
  let texel = textureLoad(source, id.xy * textureDimensions(source) / samples, 0).rgb;
  let bin = vec3u(round(display(texel) * 255.0));
  count(0u, bin.r);
  count(1u, bin.g);
  count(2u, bin.b);
}
