import { display } from "../../lib/color.wgsl";
import { linearToSrgb3 } from "@vgpu/wgsl-std/color";

struct Params {
  working: u32,
  channels: u32,
  premultiplied: u32,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> bins: array<atomic<u32>, 768>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> heights: array<f32>;

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

@compute @workgroup_size(16, 16) fn count(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= samples)) {
    return;
  }
  let sample = textureLoad(source, id.xy * textureDimensions(source) / samples, 0);
  if (sample.a == 0.0) { return; }
  let texel = sample.rgb / select(1.0, sample.a, params.premultiplied != 0u);
  var encoded = display(texel);
  if (params.working != 0u) {
    encoded = linearToSrgb3(clamp(texel, vec3f(0.0), vec3f(1.0)));
  }
  softBin(0u, encoded.r * 255.0);
  softBin(1u, encoded.g * 255.0);
  softBin(2u, encoded.b * 255.0);
}

var<workgroup> peaks: array<f32, 256>;
const kernel = array<f32, 5>(1.0, 4.0, 6.0, 4.0, 1.0);

// A separate dispatch makes every bin visible before smoothing. One workgroup
// reduces the shared peak, then writes only the requested 256 or 768 ordinates.
@compute @workgroup_size(256) fn finish(@builtin(local_invocation_index) bin: u32) {
  var values = vec3f(0.0);
  for (var k = 0u; k < 5u; k++) {
    let neighbor = i32(bin) + i32(k) - 2;
    if (neighbor >= 0 && neighbor < 256) {
      for (var channel = 0u; channel < 3u; channel++) {
        values[channel] += f32(atomicLoad(&bins[channel * 256u + u32(neighbor)])) * kernel[k] / 16.0;
      }
    }
  }
  if (params.channels == 1u) {
    values = vec3f(values.r + values.g + values.b, 0.0, 0.0);
  }
  peaks[bin] = max(values.r, max(values.g, values.b));
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride /= 2u) {
    if (bin < stride) {
      peaks[bin] = max(peaks[bin], peaks[bin + stride]);
    }
    workgroupBarrier();
  }
  for (var channel = 0u; channel < params.channels; channel++) {
    heights[channel * 256u + bin] = 100.0 * (1.0 - sqrt(values[channel] / max(1.0, peaks[0])));
  }
}
