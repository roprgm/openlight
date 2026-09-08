struct Params { count: u32 }
struct Job { input: u32, inputLength: u32, output: u32, outputLength: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input: array<u32>;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;
@group(0) @binding(3) var<storage, read> jobs: array<Job>;

// Canonical Huffman tables: symbols per code length, then symbols in code order.
// Table 0 is literal/length (also the code-length code), table 1 is distance.
var<workgroup> counts: array<u32, 32>;
var<workgroup> symbols: array<u32, 320>;
var<workgroup> lengths: array<u32, 320>;

var<private> lengthBase = array<u32, 29>(3u, 4u, 5u, 6u, 7u, 8u, 9u, 10u, 11u, 13u, 15u, 17u, 19u, 23u, 27u, 31u, 35u, 43u, 51u, 59u, 67u, 83u, 99u, 115u, 131u, 163u, 195u, 227u, 258u);
var<private> lengthExtra = array<u32, 29>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 1u, 1u, 1u, 1u, 2u, 2u, 2u, 2u, 3u, 3u, 3u, 3u, 4u, 4u, 4u, 4u, 5u, 5u, 5u, 5u, 0u);
var<private> distanceBase = array<u32, 30>(1u, 2u, 3u, 4u, 5u, 7u, 9u, 13u, 17u, 25u, 33u, 49u, 65u, 97u, 129u, 193u, 257u, 385u, 513u, 769u, 1025u, 1537u, 2049u, 3073u, 4097u, 6145u, 8193u, 12289u, 16385u, 24577u);
var<private> distanceExtra = array<u32, 30>(0u, 0u, 0u, 0u, 1u, 1u, 2u, 2u, 3u, 3u, 4u, 4u, 5u, 5u, 6u, 6u, 7u, 7u, 8u, 8u, 9u, 9u, 10u, 10u, 11u, 11u, 12u, 12u, 13u, 13u);
var<private> order = array<u32, 19>(16u, 17u, 18u, 0u, 8u, 7u, 9u, 6u, 10u, 5u, 11u, 4u, 12u, 3u, 13u, 2u, 14u, 1u, 15u);

var<private> at: u32;
var<private> end: u32;
var<private> bitBuffer: u32;
var<private> bitCount: u32;
var<private> out: u32;
var<private> outStart: u32;
var<private> outEnd: u32;
var<private> cachedIndex: u32 = 0xFFFFFFFFu;
var<private> cachedWord: u32 = 0u;

fn byteAt(i: u32) -> u32 { return (input[i >> 2u] >> ((i & 3u) * 8u)) & 0xFFu; }

fn bits(n: u32) -> u32 {
  while bitCount < n {
    bitBuffer |= select(0u, byteAt(at), at < end) << bitCount;
    at += 1u;
    bitCount += 8u;
  }
  let value = bitBuffer & ((1u << n) - 1u);
  bitBuffer >>= n;
  bitCount -= n;
  return value;
}

fn flush() {
  if cachedIndex != 0xFFFFFFFFu { output[cachedIndex] = cachedWord; }
}

fn writeByte(value: u32) {
  if out >= outEnd { return; }
  let index = out >> 2u;
  if index != cachedIndex {
    flush();
    cachedIndex = index;
    cachedWord = output[index];
  }
  let shift = (out & 3u) * 8u;
  cachedWord = (cachedWord & ~(0xFFu << shift)) | (value << shift);
  out += 1u;
}

fn readBack(distance: u32) -> u32 {
  let i = out - distance;
  let word = select(output[i >> 2u], cachedWord, (i >> 2u) == cachedIndex);
  return (word >> ((i & 3u) * 8u)) & 0xFFu;
}

// Builds table `t` from lengths[start .. start + n).
fn construct(t: u32, start: u32, n: u32) {
  var offsets: array<u32, 16>;
  for (var len = 0u; len < 16u; len++) { counts[t * 16u + len] = 0u; }
  for (var s = 0u; s < n; s++) { counts[t * 16u + lengths[start + s]] += 1u; }
  offsets[1] = 0u;
  for (var len = 1u; len < 15u; len++) { offsets[len + 1u] = offsets[len] + counts[t * 16u + len]; }
  for (var s = 0u; s < n; s++) {
    let len = lengths[start + s];
    if len != 0u {
      symbols[t * 288u + offsets[len]] = s;
      offsets[len] += 1u;
    }
  }
}

fn decode(t: u32) -> u32 {
  var code = 0u;
  var first = 0u;
  var index = 0u;
  for (var len = 1u; len < 16u; len++) {
    code |= bits(1u);
    let count = counts[t * 16u + len];
    if code < first + count { return symbols[t * 288u + index + code - first]; }
    index += count;
    first = (first + count) << 1u;
    code <<= 1u;
  }
  return 0xFFFFu;
}

// Literal/length and distance codes until end of block; false on corrupt data.
fn codes() -> bool {
  loop {
    let symbol = decode(0u);
    if symbol == 256u { return true; }
    if symbol > 285u { return false; }
    if symbol < 256u {
      writeByte(symbol);
      continue;
    }
    let length = lengthBase[symbol - 257u] + bits(lengthExtra[symbol - 257u]);
    let d = decode(1u);
    if d >= 30u { return false; }
    let distance = distanceBase[d] + bits(distanceExtra[d]);
    if distance > out - outStart { return false; }
    for (var k = 0u; k < length; k++) { writeByte(readBack(distance)); }
    if out >= outEnd { return true; }
  }
}

fn stored() {
  bitBuffer = 0u;
  bitCount = 0u;
  let length = byteAt(at) | (byteAt(at + 1u) << 8u);
  at += 4u;
  for (var k = 0u; k < length; k++) {
    writeByte(byteAt(at));
    at += 1u;
  }
}

fn fixed() {
  for (var s = 0u; s < 288u; s++) {
    lengths[s] = select(select(select(8u, 7u, s >= 256u), 9u, s >= 144u && s < 256u), 8u, s >= 280u);
  }
  construct(0u, 0u, 288u);
  for (var s = 0u; s < 30u; s++) { lengths[s] = 5u; }
  construct(1u, 0u, 30u);
}

fn dynamic() -> bool {
  let nlen = bits(5u) + 257u;
  let ndist = bits(5u) + 1u;
  let ncode = bits(4u) + 4u;
  for (var i = 0u; i < 19u; i++) { lengths[i] = 0u; }
  for (var i = 0u; i < ncode; i++) { lengths[order[i]] = bits(3u); }
  construct(0u, 0u, 19u);
  var index = 0u;
  while index < nlen + ndist {
    let symbol = decode(0u);
    if symbol < 16u {
      lengths[index] = symbol;
      index += 1u;
      continue;
    }
    var value = 0u;
    var repeat = 0u;
    if symbol == 16u {
      if index == 0u { return false; }
      value = lengths[index - 1u];
      repeat = 3u + bits(2u);
    } else if symbol == 17u {
      repeat = 3u + bits(3u);
    } else if symbol == 18u {
      repeat = 11u + bits(7u);
    } else {
      return false;
    }
    if index + repeat > nlen + ndist { return false; }
    for (var k = 0u; k < repeat; k++) {
      lengths[index] = value;
      index += 1u;
    }
  }
  construct(0u, 0u, nlen);
  construct(1u, nlen, ndist);
  return true;
}

// One zlib stream (a strip or tile) per workgroup.
@compute @workgroup_size(1) fn inflate(@builtin(workgroup_id) id: vec3u) {
  if id.x >= params.count { return; }
  let job = jobs[id.x];
  at = job.input + 2u;
  end = job.input + job.inputLength;
  out = job.output;
  outStart = job.output;
  outEnd = job.output + job.outputLength;
  bitBuffer = 0u;
  bitCount = 0u;
  loop {
    let last = bits(1u);
    let kind = bits(2u);
    var ok = true;
    if kind == 0u {
      stored();
    } else if kind == 1u {
      fixed();
      ok = codes();
    } else if kind == 2u {
      ok = dynamic() && codes();
    } else {
      ok = false;
    }
    if !ok || last == 1u || out >= outEnd || at > end { break; }
  }
  flush();
}
