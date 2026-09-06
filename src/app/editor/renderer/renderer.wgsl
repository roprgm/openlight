import { View, imagePoint, previewColor, background } from "../../../lib/image-display/display.wgsl";

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
@group(0) @binding(3) var original: texture_2d<f32>;
@group(0) @binding(4) var<uniform> split: f32;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = imagePoint(view, uv);
  var sample = textureSampleLevel(source, sourceSampler, p, 0.0);
  if (uv.x < split) {
    sample = textureSampleLevel(original, sourceSampler, p, 0.0);
  }
  let inside = all(p >= vec2f(0.0)) && all(p <= vec2f(1.0));
  return vec4f(select(background, previewColor(sample, view), inside), 1.0);
}
