import { display } from "../../../lib/color.wgsl";

struct Params {
  size: vec2f,
  sourceSize: vec2f,
  pan: vec2f,
  zoom: f32,
  mode: u32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

const background = vec3f(0.09);

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Zoom 1 fits the image (contain, capped at 1:1), scaled about the center, then shifted by pan.
  let scale = min(min(params.size.x / params.sourceSize.x, params.size.y / params.sourceSize.y), 1.0) * params.zoom;
  let p = ((uv - 0.5) * params.size - params.pan) / (params.sourceSize * scale) + 0.5;
  let inside = all(p >= vec2f(0.0)) && all(p <= vec2f(1.0));
  let texel = textureSampleLevel(source, sourceSampler, p, 0.0);
  let color = display(texel.rgb / max(texel.a, 0.000001));
  if (params.mode == 1u) {
    // Canvas presentation expects premultiplied display RGB for transparent PNGs.
    return vec4f(color * texel.a, texel.a);
  }
  if (params.mode == 2u) {
    return vec4f(mix(vec3f(1.0), color, texel.a), 1.0);
  }
  let tile = vec2u(uv * params.size / 10.0);
  let checker = vec3f(select(0.16, 0.22, (tile.x + tile.y) % 2u == 0u));
  return vec4f(select(background, mix(checker, color, texel.a), inside), 1.0);
}
