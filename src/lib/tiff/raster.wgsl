struct Params {
  size: vec2u,
  orientation: u32, channels: u32, photo: u32, alpha: u32,
  maximum: f32,
  matrix: mat3x3f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d_array<f32>;
@group(0) @binding(2) var<storage, read> curves: array<f32>;
@group(0) @binding(3) var<storage, read_write> invalid: atomic<u32>;

fn transfer(value: f32, channel: u32) -> f32 {
  let last = arrayLength(&curves) / 3u - 1u;
  let position = clamp(value, 0.0, 1.0) * f32(last);
  let lo = min(u32(position), last - 1u);
  let a = curves[channel * (last + 1u) + lo];
  let b = curves[channel * (last + 1u) + lo + 1u];
  // Extend the endpoint tangent; linear float profiles retain negative values and HDR headroom.
  return mix(a, b, value * f32(last) - f32(lo));
}
fn finish(rgb: vec3f, alpha: f32) -> vec4f {
  let value=vec4f(params.matrix*rgb,alpha);
  if any(abs(value)>vec4f(65504.0)) { atomicOr(&invalid,2u); return vec4f(0.0); }
  return value;
}
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var p = vec2u(position.xy);
  if params.orientation >= 5u { p = p.yx; }
  if params.orientation == 2u || params.orientation == 3u || params.orientation == 7u || params.orientation == 8u { p.x = params.size.x - 1u - p.x; }
  if params.orientation == 3u || params.orientation == 4u || params.orientation == 6u || params.orientation == 7u { p.y = params.size.y - 1u - p.y; }
  let gray = params.photo != 2u;
  let colors = select(3u, 1u, gray);
  var alpha = 1.0;
  if params.channels > colors { alpha = textureLoad(source, vec2i(p), i32(colors), 0).r / params.maximum; }
  var rgb = vec3f(0.0);
  for (var c = 0u; c < 3u; c++) {
    var value = textureLoad(source, vec2i(p), i32(select(c, 0u, gray)), 0).r / params.maximum;
    if params.photo == 0u { value = 1.0 - value; }
    if params.alpha == 1u { value = select(0.0, value / max(alpha, 1e-20), alpha > 0.0); }
    rgb[c] = transfer(value, c);
  }
  return finish(rgb, alpha);
}
