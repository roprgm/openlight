import { transferChroma } from "./chroma-transfer.wgsl";
import { packColor, unpackColor } from "./color.wgsl";
import { luminance } from "../../../core/image/color.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var coarse: texture_2d<f32>;
@group(0) @binding(2) var coarseFiltered: texture_2d<f32>;
@group(0) @binding(3) var<uniform> variance: array<vec4f, 16>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let original = textureLoad(source, p, 0);
  if original.a < 1.0 { return original; }
  let before = packColor(original);
  let after = transferChroma(source, coarse, coarseFiltered, p, variance, true);
  // Apply a delta to avoid a color-space round trip when the correction is zero.
  let correction = unpackColor(after.rgb) - unpackColor(before.rgb);
  // Keep actual working-space luminance, including HDR headroom and fine texture.
  return vec4f(original.rgb + correction - vec3f(luminance(correction)), original.a);
}
