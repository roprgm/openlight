import { display } from "../../lib/color.wgsl";
import { linearToSrgb3 } from "@vgpu/wgsl-std/color";

struct Params {
  working: u32,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> bins: array<atomic<u32>, 768>;
@group(0) @binding(2) var<uniform> params: Params;

const samples = vec2u(512, 320);
// Soft-binning weight spread across a bin pair; kept as a fixed-point scale so atomics stay integer.
const weight = 1024u;

// Splits one texel's vote between its two nearest bins instead of flooring into a single one.
fn softBin(channel: u32, position: f32) {
  let clamped = clamp(position, 0.0, 255.0);
  let lo = u32(floor(clamped));
  let hi = min(lo + 1u, 255u);
  let hiWeight = u32(round((clamped - f32(lo)) * f32(weight)));
  atomicAdd(&bins[channel * 256u + lo], weight - hiWeight);
  atomicAdd(&bins[channel * 256u + hi], hiWeight);
}

@compute @workgroup_size(16, 16) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= samples)) {
    return;
  }
  let texel = textureLoad(source, id.xy * textureDimensions(source) / samples, 0).rgb;
  var encoded = display(texel);
  if (params.working != 0u) {
    encoded = linearToSrgb3(clamp(texel, vec3f(0.0), vec3f(1.0)));
  }
  softBin(0u, encoded.r * 255.0);
  softBin(1u, encoded.g * 255.0);
  softBin(2u, encoded.b * 255.0);
}
