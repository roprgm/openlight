import { unpackColor } from "./color.wgsl";
struct Accumulator { value: array<f32, 8> }
struct Params { origin: vec2i, offset: vec2i, stage: u32 }
@group(0) @binding(0) var noisy: texture_2d<f32>;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> accumulated: array<Accumulator>;
@group(0) @binding(3) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let local = p - params.origin;
  let a = accumulated[u32(local.y * 128 + local.x)].value;
  let original = textureLoad(noisy, local + params.offset, 0);
  let weights = vec3f(a[4], a[5], a[6]);
  let filtered = select(original.rgb, vec3f(a[0], a[1], a[2]) / max(weights, vec3f(1e-20)), all(weights > vec3f(1e-20)));
  if params.stage == 0u { return vec4f(filtered, original.a); }
  let input = textureLoad(source, p, 0);
  // Preserve translucent pixels and their immediate boundary. Hidden RGB never
  // enters filtering unattenuated; alpha itself is neither filtered nor blended.
  var coverage = input.a;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      coverage = min(coverage, textureLoad(source, clamp(p + vec2i(x, y), vec2i(0), vec2i(textureDimensions(source)) - 1), 0).a);
    }
  }
  if coverage < 1.0 { return input; }
  return vec4f(unpackColor(filtered), input.a);
}
