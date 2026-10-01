import { linearToSrgb, srgbToLinear3 } from "@vgpu/wgsl-std/color";
import { toOklab } from "../../image/oklab.wgsl";
import { display, luminance } from "../../image/color.wgsl";
import { gradientCoverage } from "../blend/coverage.wgsl";

struct Params {
  kind: u32,
  first: vec2f,
  second: vec2f,
  feather: f32,
  angle: f32,
  color: vec3f,
  tolerance: f32,
  min: f32,
  max: f32,
  smoothness: f32,
  extent: vec2f,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn coverage(uv: vec2f) -> f32 {
  if (params.kind <= 2u) {
    return gradientCoverage(uv * params.extent, params.first, params.second, params.kind, params.feather, params.angle);
  }
  let at = min(vec2i(uv * vec2f(textureDimensions(source))), vec2i(textureDimensions(source)) - 1);
  let pixel = textureLoad(source, at, 0);
  if (pixel.a <= 0.0) { return 0.0; }
  if (params.kind == 4u) {
    let sample = toOklab(srgbToLinear3(params.color));
    let color = toOklab(srgbToLinear3(display(pixel.rgb)));
    let distance = length(color - sample);
    let radius = max(params.tolerance * 0.8, 0.001);
    let inner = radius * (1.0 - params.smoothness);
    return 1.0 - smoothstep(inner, max(radius, inner + 0.000001), distance);
  }
  let light = linearToSrgb(clamp(luminance(pixel.rgb), 0.0, 1.0));
  let feather = params.smoothness * 0.25;
  if (feather == 0.0) {
    return select(0.0, 1.0, light >= params.min && light <= params.max);
  }
  let lower = select(smoothstep(params.min - feather, params.min, light), 1.0, params.min == 0.0);
  let upper = select(1.0 - smoothstep(params.max, params.max + feather, light), 1.0, params.max == 1.0);
  return lower * upper;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(coverage(uv), 0.0, 0.0, 1.0);
}
