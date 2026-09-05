import { display } from "../../../lib/color.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> size: vec2f;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sourceSize = vec2f(textureDimensions(source));
  let scale = min(size.x / sourceSize.x, size.y / sourceSize.y);
  let p = (uv - 0.5) * size / (sourceSize * scale) + 0.5;
  let inside = all(p >= vec2f(0.0)) && all(p <= vec2f(1.0));
  let color = textureSampleLevel(source, sourceSampler, p, 0.0);
  let tile = vec2u(uv * size / 6.0);
  let checker = vec3f(select(0.16, 0.22, (tile.x + tile.y) % 2u == 0u));
  return vec4f(select(vec3f(0.09), mix(checker, display(color.rgb), color.a), inside), 1.0);
}
