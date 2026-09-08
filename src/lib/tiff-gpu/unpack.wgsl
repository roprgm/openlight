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
  chunksPerPlane: u32,
  maxRows: u32,
  rowWords: u32,
}
struct Chunk { offset: u32, length: u32, x: u32, y: u32, width: u32, height: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> data: array<u32>;
@group(0) @binding(2) var<storage, read> chunks: array<Chunk>;
@group(0) @binding(3) var<storage, read> colorMap: array<u32>;
// Packed rgba16 pixels with rows padded to `rowWords`, copied into the texture afterwards.
@group(0) @binding(4) var<storage, read_write> output: array<u32>;

fn byteAt(i: u32) -> u32 { return (data[i >> 2u] >> ((i & 3u) * 8u)) & 0xFFu; }

// Sample at a byte offset plus a bit offset for sub-byte depths (most significant bit first).
// Multi-byte samples follow the file's byte order; the high word only matters for 64 bits.
fn sampleAt(byte: u32, bit: u32) -> vec2u {
  if params.bits < 8u {
    return vec2u((byteAt(byte) >> (8u - params.bits - bit)) & ((1u << params.bits) - 1u), 0u);
  }
  let count = params.bits / 8u;
  var value = vec2u(0u);
  for (var k = 0u; k < count; k++) {
    let b = byteAt(byte + select(count - 1u - k, k, params.littleEndian == 1u));
    if k < 4u { value.x |= b << (8u * k); } else { value.y |= b << (8u * (k - 4u)); }
  }
  return value;
}

// Integers scale to 16 bits; floats become float16 bit patterns.
fn to16(sample: vec2u) -> u32 {
  if params.float == 1u {
    if params.bits == 16u { return sample.x; }
    var value = bitcast<f32>(sample.x);
    if params.bits == 64u {
      // Double to single: sign, rebiased exponent, top 23 mantissa bits.
      let exponent = i32((sample.y >> 20u) & 0x7FFu) - 896;
      let mantissa = ((sample.y & 0xFFFFFu) << 3u) | (sample.x >> 29u);
      value = bitcast<f32>((sample.y & 0x80000000u) | (u32(clamp(exponent, 0, 255)) << 23u) | mantissa);
    }
    return pack2x16float(vec2f(value, 0.0)) & 0xFFFFu;
  }
  if params.bits < 16u { return sample.x * 65535u / ((1u << params.bits) - 1u); }
  if params.bits == 16u { return sample.x; }
  return select(sample.x, sample.y, params.bits == 64u) >> 16u;
}

// One thread per chunk row: walks the row, undoing horizontal prediction, and stores texels.
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
    var texel = vec4u(0u);
    for (var s = 0u; s < count; s++) {
      let c = chunks[chunk + select(0u, s, planar) * params.chunksPerPlane];
      let bit = (x * stride + select(s, 0u, planar)) * params.bits;
      var sample = sampleAt(c.offset + row * rowBytes + bit / 8u, bit & 7u);
      if params.predictor == 2u {
        acc[s] = (acc[s] + sample.x) & mask;
        sample.x = acc[s];
      }
      texel[s] = select(to16(sample), sample.x, params.palette == 1u);
    }
    let last = params.colors - 1u;
    var color = vec4u(texel[0], texel[min(1u, last)], texel[min(2u, last)], select(65535u, 0x3C00u, params.float == 1u));
    if params.palette == 1u {
      let entries = 1u << params.bits;
      color = vec4u(colorMap[texel[0]], colorMap[entries + texel[0]], colorMap[2u * entries + texel[0]], 65535u);
    }
    if params.samples > params.colors { color.a = texel[params.colors]; }
    if params.whiteIsZero == 1u { color = vec4u(vec3u(65535u) - color.rgb, color.a); }
    if first.x + x < params.width {
      let at = y * params.rowWords + (first.x + x) * 2u;
      output[at] = color.r | (color.g << 16u);
      output[at + 1u] = color.b | (color.a << 16u);
    }
  }
}
