import { adjustColor } from "./adjust.wgsl";
import { Adjustments } from "./prepare.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> adjustments: Adjustments;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let input = textureSample(source, sourceSampler, uv);
  return vec4f(adjustColor(input.rgb, adjustments), input.a);
}
