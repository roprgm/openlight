struct Layout {
  width: u32, height: u32, samples: u32, rowBytes: u32,
  bits: u32, format: u32, predictor: u32, little: u32,
  stride: u32,
}
@group(0) @binding(0) var<uniform> params: Layout;
@group(0) @binding(1) var<storage, read> packed: array<u32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;
@group(0) @binding(3) var<storage, read_write> scratch: array<u32>;
@group(0) @binding(4) var<storage, read_write> invalid: atomic<u32>;

fn byte(at: u32) -> u32 { return (packed[at / 4u] >> ((at % 4u) * 8u)) & 255u; }
fn integer(row: u32, index: u32) -> u32 {
  let start = row * params.rowBytes;
  var value = 0u;
  if params.bits % 8u == 0u {
    let count = params.bits / 8u;
    for (var n = 0u; n < count; n++) {
      let shift = select(count - 1u - n, n, params.little == 1u) * 8u;
      value |= byte(start + index * count + n) << shift;
    }
  } else {
    for (var n = 0u; n < params.bits; n++) {
      let bit = index * params.bits + n;
      value = (value << 1u) | ((byte(start + bit / 8u) >> (7u - bit % 8u)) & 1u);
    }
  }
  return value;
}

// TIFF predictors restart at each row. Rows execute independently without cross-row atomics.
@compute @workgroup_size(64) fn unpack(@builtin(global_invocation_id) id: vec3u) {
  let count = params.width * params.samples;
  let independent = params.predictor == 1u;
  let row = select(id.x, id.x / count, independent);
  if row >= params.height { return; }
  var previous = vec4u(0u);
  if params.predictor == 3u {
    // Floating prediction differences bytes across the shuffled row, including plane boundaries.
    for (var i = 0u; i < params.rowBytes; i++) {
      let channel = i % params.samples;
      previous[channel] = (previous[channel] + byte(row * params.rowBytes + i)) & 255u;
      scratch[row * params.rowBytes + i] = previous[channel];
    }
  }
  let first = select(0u, id.x % count, independent);
  let end = select(count, first + 1u, independent);
  for (var i = first; i < end; i++) {
    let channel = i % params.samples;
    var bits = integer(row, i);
    if params.predictor == 2u {
      bits += previous[channel];
      if params.bits < 32u { bits &= (1u << params.bits) - 1u; }
      previous[channel] = bits;
    }
    if params.predictor == 3u {
      bits = 0u;
      for (var n = 0u; n < params.bits / 8u; n++) {
        bits = (bits << 8u) | scratch[row * params.rowBytes + n * count + i];
      }
    }
    var value = f32(bits);
    if params.format == 3u {
      if params.bits == 32u {
        if (bits & 0x7f800000u) == 0x7f800000u { atomicOr(&invalid, 1u); bits=0u; }
        value = bitcast<f32>(bits);
      }
      else {
        if (bits & 0x7c00u) == 0x7c00u { atomicOr(&invalid, 1u); bits=0u; }
        value = unpack2x16float(bits).x;
      }
    }
    if params.format==3u && abs(value)>65504.0 { atomicOr(&invalid,2u); value=0.0; }
    output[(channel * params.height + row) * params.stride + i / params.samples] = value;
  }
}
