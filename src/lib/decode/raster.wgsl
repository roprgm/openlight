struct Params {
  size: vec2u,
  orientation: u32,
  float: u32,
  premultiplied: u32,
  matrix: mat3x3f,
}
@group(0) @binding(0) var<uniform> params: Params;
// 16-bit integers, or float16 bit patterns when `float` is set.
@group(0) @binding(1) var source: texture_2d<u32>;
@group(0) @binding(2) var<storage, read> curves: array<f32>;

// Transfer curve sampled over 0..1; samples outside keep their distance, so HDR and negative values pass through.
fn transfer(value: f32, channel: u32) -> f32 {
  let last = arrayLength(&curves) / 3u - 1u;
  let bounded = clamp(value, 0.0, 1.0);
  let position = bounded * f32(last);
  let low = min(u32(position), last - 1u);
  let base = channel * (last + 1u) + low;
  return mix(curves[base], curves[base + 1u], position - f32(low)) + (value - bounded);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  // TIFF orientation: where this output pixel sits in the stored image.
  var p = vec2u(position.xy);
  let o = params.orientation;
  if o >= 5u { p = p.yx; }
  if o == 2u || o == 3u || o == 7u || o == 8u { p.x = params.size.x - 1u - p.x; }
  if o == 3u || o == 4u || o == 6u || o == 7u { p.y = params.size.y - 1u - p.y; }
  let bits = textureLoad(source, p, 0);
  var texel = vec4f(bits) / 65535.0;
  if params.float == 1u {
    texel = vec4f(unpack2x16float(bits.r).x, unpack2x16float(bits.g).x, unpack2x16float(bits.b).x, unpack2x16float(bits.a).x);
  }
  let rgb = select(texel.rgb, texel.rgb / max(texel.a, 0.000001), params.premultiplied == 1u);
  let linear = vec3f(transfer(rgb.r, 0u), transfer(rgb.g, 1u), transfer(rgb.b, 2u));
  return vec4f(params.matrix * linear, texel.a);
}
