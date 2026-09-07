import { View, imagePoint, previewColor, background } from "./display.wgsl";
import { Transform, sourcePoint } from "../image-frame/transform.wgsl";

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
@group(0) @binding(3) var<uniform> transform: Transform;
@group(0) @binding(4) var original: texture_2d<f32>;
@group(0) @binding(5) var<uniform> split: f32;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = sourcePoint(transform, imagePoint(view, uv));
  let edited = textureSampleLevel(source, sourceSampler, p, 0.0);
  let before = textureSampleLevel(original, sourceSampler, p, 0.0);
  let color = previewColor(select(edited, before, uv.x < split), view);
  let inside = all(p >= vec2f(0.0)) && all(p <= vec2f(1.0));
  return vec4f(select(background, color, inside), 1.0);
}
