import { linearToSrgb3 } from "@vgpu/wgsl-std/color";

struct Params {
  size: vec2f,
  image: vec2f,
  pan: vec2f,
  zoom: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

const background = vec3f(0.09);

// Rec.2020, the working space, to linear sRGB primaries (column-major).
const rec2020ToSrgb = mat3x3f(
  1.6605, -0.1246, -0.0182,
  -0.5876, 1.1329, -0.1006,
  -0.0728, -0.0083, 1.1187,
);

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Zoom 1 fits the image (contain, capped at 1:1), scaled about the center, then shifted by pan.
  let scale = min(min(params.size.x / params.image.x, params.size.y / params.image.y), 1.0) * params.zoom;
  let p = ((uv - 0.5) * params.size - params.pan) / (params.image * scale) + 0.5;
  let inside = all(p >= vec2f(0.0)) && all(p <= vec2f(1.0));
  let linear = rec2020ToSrgb * textureSampleLevel(source, sourceSampler, p, 0.0).rgb;
  let color = linearToSrgb3(clamp(linear, vec3f(0.0), vec3f(1.0)));
  return vec4f(select(background, color, inside), 1.0);
}
