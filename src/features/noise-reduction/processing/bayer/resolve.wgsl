struct Accumulator { value: array<f32, 8> }
struct Params { origin: vec2u }
@group(0) @binding(0) var noisy: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> accumulated: array<Accumulator>;
@group(0) @binding(2) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2u(position.xy) - params.origin;
  let a = accumulated[p.y * 128u + p.x].value;
  let weights = vec4f(a[4], a[5], a[6], a[7]);
  let original = textureLoad(noisy, vec2i(position.xy), 0);
  let v = vec4f(a[0], a[1], a[2], a[3]) / max(weights, vec4f(1e-20));
  // Invert the normalized Hadamard color basis after weighting each component.
  let filtered = 0.5 * vec4f(v.x + v.y + v.z + v.w, v.x - v.y + v.z - v.w, v.x + v.y - v.z - v.w, v.x - v.y - v.z + v.w);
  return select(original, filtered, all(weights > vec4f(1e-20)));
}
