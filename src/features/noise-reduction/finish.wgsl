// The filtered spectrum back to sensor samples above black, each texel one 2 × 2 cell's four by
// position.
import { fromSpectrum, Noise, unstabilize } from "./stabilize.wgsl";
import { unpack } from "./texels.wgsl";

@group(0) @binding(0) var<uniform> noise: Noise;
@group(0) @binding(1) var<uniform> size: vec2u;
@group(0) @binding(2) var<storage, read> spectrum: array<vec2u>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2u(position.xy);
  let z = fromSpectrum(unpack(spectrum[p.y * size.x + p.x]), noise);
  return unstabilize(z, noise);
}
