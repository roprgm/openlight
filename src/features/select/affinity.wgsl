import { luminance, rec2020ToSrgb } from "../../lib/color.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
// Five cues need five channels: Lab + variance, and a separate scalar edge texture.
@group(0) @binding(2) var affinity: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var edges: texture_storage_2d<r32float, write>;

fn sample(p: vec2i, size: vec2u) -> vec3f {
  let uv = (vec2f(clamp(p, vec2i(0), vec2i(size) - 1)) + 0.5) / vec2f(size);
  return textureSampleLevel(source, linearSampler, uv, 0.0).rgb;
}

// Ottosson's OKLab transform: https://bottosson.github.io/posts/oklab/
// Linear Rec.2020 -> linear sRGB primaries -> LMS; no transfer curve or gamut clipping.
fn oklab(working: vec3f) -> vec3f {
  let rgb = rec2020ToSrgb * working;
  let lms = mat3x3f(
    0.4122214708, 0.2119034982, 0.0883024619,
    0.5363325363, 0.6806995451, 0.2817188376,
    0.0514459929, 0.1073969566, 0.6299787005
  ) * rgb;
  let root = sign(lms) * pow(abs(lms), vec3f(1.0 / 3.0));
  return mat3x3f(
    0.2104542553, 1.9779984951, 0.0259040371,
    0.7936177850, -2.4285922050, 0.7827717662,
    -0.0040720468, 0.4505937099, -0.8086757660
  ) * root;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(affinity);
  if (any(id.xy >= size)) { return; }
  let p = vec2i(id.xy);
  var mean = 0.0;
  var square = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let l = luminance(sample(p + vec2i(x, y), size));
      mean += l / 25.0;
      square += l * l / 25.0;
    }
  }
  let dx = luminance(sample(p + vec2i(1, 0), size)) - luminance(sample(p - vec2i(1, 0), size));
  let dy = luminance(sample(p + vec2i(0, 1), size)) - luminance(sample(p - vec2i(0, 1), size));
  textureStore(affinity, p, vec4f(oklab(sample(p, size)), max(0.0, square - mean * mean)));
  textureStore(edges, p, vec4f(length(vec2f(dx, dy)) * 0.5));
}
