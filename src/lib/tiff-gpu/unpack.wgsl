struct Params {
  width: u32,
  height: u32,
  samples: u32,
  colors: u32,
  bits: u32,
  littleEndian: u32,
  float: u32,
  whiteIsZero: u32,
  planar: u32,
  predictor: u32,
  palette: u32,
  wide: u32,
  premultiplied: u32,
  orientation: u32,
  chunksPerPlane: u32,
  maxRows: u32,
  rowWords: u32,
  origin: vec2u,
  matrix: mat3x3f,
}
struct Chunk { offset: u32, length: u32, x: u32, y: u32, width: u32, height: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> data: array<u32>;
@group(0) @binding(2) var<storage, read> chunks: array<Chunk>;
@group(0) @binding(3) var<storage, read> colorMap: array<u32>;
@group(0) @binding(4) var<storage, read> curves: array<f32>;
// Linear rgba pixels for this band's output rectangle, float16 pairs or float32, rows padded to `rowWords`.
@group(0) @binding(5) var<storage, read_write> output: array<u32>;

fn byteAt(i: u32) -> u32 { return (data[i >> 2u] >> ((i & 3u) * 8u)) & 0xFFu; }

// Sample bits at a byte offset plus a bit offset. Depths that are not whole bytes (1, 2, 4, 12, 14 bits)
// form a most-significant-bit-first stream, read through a 40-bit window so any depth up to 32 fits at
// any offset; whole-byte samples follow the file's byte order, and the high word only matters for 64 bits.
fn sampleAt(byte: u32, bit: u32) -> vec2u {
  if params.bits % 8u != 0u {
    var window = 0u;
    for (var k = 0u; k < 4u; k++) { window = (window << 8u) | byteAt(byte + k); }
    let aligned = (window << bit) | (byteAt(byte + 4u) >> (8u - bit));
    return vec2u(aligned >> (32u - params.bits), 0u);
  }
  let count = params.bits / 8u;
  var value = vec2u(0u);
  for (var k = 0u; k < count; k++) {
    let b = byteAt(byte + select(count - 1u - k, k, params.littleEndian == 1u));
    if k < 4u { value.x |= b << (8u * k); } else { value.y |= b << (8u * (k - 4u)); }
  }
  return value;
}

// Integers normalize to 0..1; floats keep their value.
fn toFloat(sample: vec2u) -> f32 {
  if params.float == 1u {
    if params.bits == 16u { return unpack2x16float(sample.x).x; }
    if params.bits == 32u { return bitcast<f32>(sample.x); }
    // Double to single: sign, rebiased exponent, top 23 mantissa bits.
    let exponent = i32((sample.y >> 20u) & 0x7FFu) - 896;
    let mantissa = ((sample.y & 0xFFFFFu) << 3u) | (sample.x >> 29u);
    return bitcast<f32>((sample.y & 0x80000000u) | (u32(clamp(exponent, 0, 255)) << 23u) | mantissa);
  }
  if params.bits >= 32u { return f32(select(sample.x, sample.y, params.bits == 64u)) / 4294967295.0; }
  return f32(sample.x) / f32((1u << params.bits) - 1u);
}

// Transfer curve over 0..1; samples outside keep their distance, so HDR and negative values pass through.
fn transfer(value: f32, channel: u32) -> f32 {
  let last = arrayLength(&curves) / 3u - 1u;
  let bounded = clamp(value, 0.0, 1.0);
  let position = bounded * f32(last);
  let low = min(u32(position), last - 1u);
  let base = channel * (last + 1u) + low;
  return mix(curves[base], curves[base + 1u], position - f32(low)) + (value - bounded);
}

// Where a stored pixel lands after the orientation tag.
fn oriented(p: vec2u) -> vec2u {
  let w = params.width - 1u;
  let h = params.height - 1u;
  switch params.orientation {
    case 2u: { return vec2u(w - p.x, p.y); }
    case 3u: { return vec2u(w - p.x, h - p.y); }
    case 4u: { return vec2u(p.x, h - p.y); }
    case 5u: { return p.yx; }
    case 6u: { return vec2u(h - p.y, p.x); }
    case 7u: { return vec2u(h - p.y, w - p.x); }
    case 8u: { return vec2u(p.y, w - p.x); }
    default: { return p; }
  }
}

// One thread per chunk row: walks the row, undoing horizontal prediction, and writes linear pixels.
@compute @workgroup_size(64) fn unpack(@builtin(global_invocation_id) id: vec3u) {
  let chunk = id.x / params.maxRows;
  let row = id.x % params.maxRows;
  if chunk >= params.chunksPerPlane { return; }
  let first = chunks[chunk];
  let y = first.y + row;
  if row >= first.height || y >= params.height { return; }
  let planar = params.planar == 2u;
  let stride = select(params.samples, 1u, planar);
  let rowBytes = (first.width * stride * params.bits + 7u) / 8u;
  let mask = select((1u << params.bits) - 1u, 0xFFFFFFFFu, params.bits >= 32u);
  let count = min(params.samples, 4u);
  var acc = vec4u(0u);
  for (var x = 0u; x < first.width; x++) {
    var texel = vec4f(0.0);
    for (var s = 0u; s < count; s++) {
      let c = chunks[chunk + select(0u, s, planar) * params.chunksPerPlane];
      let bit = (x * stride + select(s, 0u, planar)) * params.bits;
      var sample = sampleAt(c.offset + row * rowBytes + bit / 8u, bit & 7u);
      if params.predictor == 2u {
        acc[s] = (acc[s] + sample.x) & mask;
        sample.x = acc[s];
      }
      texel[s] = toFloat(sample);
    }
    let last = params.colors - 1u;
    var rgb = vec3f(texel[0], texel[min(1u, last)], texel[min(2u, last)]);
    if params.palette == 1u {
      let entries = 1u << params.bits;
      let index = u32(round(texel[0] * f32(entries - 1u)));
      rgb = vec3f(f32(colorMap[index]), f32(colorMap[entries + index]), f32(colorMap[2u * entries + index])) / 65535.0;
    }
    let alpha = select(1.0, texel[params.colors], params.samples > params.colors);
    if params.whiteIsZero == 1u { rgb = 1.0 - rgb; }
    if params.premultiplied == 1u { rgb /= max(alpha, 0.000001); }
    let linear = vec3f(transfer(rgb.r, 0u), transfer(rgb.g, 1u), transfer(rgb.b, 2u));
    let color = params.matrix * linear;
    if first.x + x < params.width {
      let p = oriented(vec2u(first.x + x, y)) - params.origin;
      if params.wide == 1u {
        let at = p.y * params.rowWords + p.x * 4u;
        output[at] = bitcast<u32>(color.r);
        output[at + 1u] = bitcast<u32>(color.g);
        output[at + 2u] = bitcast<u32>(color.b);
        output[at + 3u] = bitcast<u32>(alpha);
      } else {
        let at = p.y * params.rowWords + p.x * 2u;
        output[at] = pack2x16float(color.rg);
        output[at + 1u] = pack2x16float(vec2f(color.b, alpha));
      }
    }
  }
}
