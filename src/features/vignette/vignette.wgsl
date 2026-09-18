import { Transform } from "../../core/renderer/transform/transform.wgsl";
struct Params {
  intensity: f32,
  softness: f32,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@group(0) @binding(2) var<uniform> transform: Transform;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  // Map document pixels into the current frame without resampling the image.
  let sourceOffset = position.xy / vec2f(textureDimensions(source)) - transform.origin;
  let determinant = transform.xAxis.x * transform.yAxis.y - transform.xAxis.y * transform.yAxis.x;
  let framePoint = vec2f(
    sourceOffset.x * transform.yAxis.y - sourceOffset.y * transform.yAxis.x,
    sourceOffset.y * transform.xAxis.x - sourceOffset.x * transform.xAxis.y
  ) / determinant;
  let offset = framePoint - 0.5;
  let radius = length(offset) * sqrt(2.0);
  let start = 0.75 * (1.0 - params.softness / 100.0);
  let gain = 1.0 - params.intensity / 100.0 * smoothstep(start, 1.0, radius);
  return vec4f(input.rgb * gain, input.a);
}
