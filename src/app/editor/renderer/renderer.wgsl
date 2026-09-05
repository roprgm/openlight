import { display, rec2020ToSrgb } from "../../../lib/color.wgsl";

import { Transform, sourcePoint } from "../../../features/crop/transform.wgsl";

struct Params {
  size: vec2f,
  fitSize: vec2f,
  sourceSize: vec2f,
  pan: vec2f,
  zoom: f32,
  split: f32,
  shadows: u32,
  highlights: u32,
  cropping: u32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
@group(0) @binding(3) var original: texture_2d<f32>;

@group(0) @binding(4) var<uniform> transform: Transform;

const background = vec3f(0.09);

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Zoom 1 fits the image (contain, capped at 200%), scaled about the center, then shifted by pan.
  let scale = min(min(params.fitSize.x / params.sourceSize.x, params.fitSize.y / params.sourceSize.y), 2.0) * params.zoom;
  let p = ((uv - 0.5) * params.size - params.pan) / (params.sourceSize * scale) + 0.5;
  let sourceUV = sourcePoint(transform, p);
  let inFrame = params.cropping != 0u || (all(p >= vec2f(0.0)) && all(p <= vec2f(1.0)));
  let inside = inFrame && all(sourceUV >= vec2f(0.0)) && all(sourceUV <= vec2f(1.0));
  var sample = textureSampleLevel(source, sourceSampler, sourceUV, 0.0);
  if (uv.x < params.split) {
    sample = textureSampleLevel(original, sourceSampler, sourceUV, 0.0);
  }
  let rgb = rec2020ToSrgb * sample.rgb;
  var color = display(sample.rgb);
  if (sample.a > 0.0) {
    if (params.shadows != 0u && all(rgb <= vec3f(0.0))) {
      color = vec3f(0.0, 0.0, 1.0);
    }
    if (params.highlights != 0u && any(rgb >= vec3f(1.0))) {
      color = vec3f(1.0, 0.0, 0.0);
    }
  }
  return vec4f(select(background, mix(background, color, sample.a), inside), 1.0);
}
