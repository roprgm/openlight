struct Params {
  width: u32, rowOffset: u32, channels: u32, photo: u32,
  alpha: u32, bits: u32, little: u32, maximum: f32,
  matrix: mat3x3f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> packed: array<u32>;
@group(0) @binding(2) var<storage, read> curves: array<f32>;
@group(0) @binding(3) var<storage, read_write> invalid: atomic<u32>;

fn sample(p: vec2u, channel: u32) -> f32 {
  let index = ((p.y - params.rowOffset) * params.width + p.x) * params.channels + channel;
  let word = packed[index * params.bits / 32u];
  var value = (word >> ((index * params.bits) % 32u)) & ((1u << params.bits) - 1u);
  if params.bits == 16u && params.little == 0u {
    value = (value >> 8u) | ((value & 255u) << 8u);
  }
  return f32(value) / params.maximum;
}

fn transfer(value: f32, channel: u32) -> f32 {
  let last = arrayLength(&curves) / 3u - 1u;
  let position = clamp(value, 0.0, 1.0) * f32(last);
  let lo = min(u32(position), last - 1u);
  let a = curves[channel * (last + 1u) + lo];
  let b = curves[channel * (last + 1u) + lo + 1u];
  return mix(a, b, position - f32(lo));
}
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2u(position.xy);
  let gray = params.photo != 2u;
  let colors = select(3u, 1u, gray);
  var alpha = 1.0;
  if params.channels > colors { alpha = sample(p, colors); }
  var rgb = vec3f(0.0);
  for (var c = 0u; c < 3u; c++) {
    var value = sample(p, select(c, 0u, gray));
    if params.photo == 0u { value = 1.0 - value; }
    if params.alpha == 1u { value = select(0.0, value / max(alpha, 1e-20), alpha > 0.0); }
    rgb[c] = transfer(value, c);
  }
  let result = vec4f(params.matrix * rgb, alpha);
  if any(abs(result) > vec4f(65504.0)) {
    atomicOr(&invalid, 1u);
    return vec4f(0.0);
  }
  return result;
}
