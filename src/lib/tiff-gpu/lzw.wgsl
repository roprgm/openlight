struct Params { count: u32 }
struct Job { input: u32, inputLength: u32, output: u32, outputLength: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input: array<u32>;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;
@group(0) @binding(3) var<storage, read> jobs: array<Job>;

// Dictionary entry: prefix code in bits 20..31, suffix byte in bits 12..19, string length in bits 0..11.
var<workgroup> table: array<u32, 4096>;

// One output word cached in registers: consecutive byte writes mostly land in the same word.
var<private> cachedIndex: u32 = 0xFFFFFFFFu;
var<private> cachedWord: u32 = 0u;

fn byteAt(i: u32) -> u32 { return (input[i >> 2u] >> ((i & 3u) * 8u)) & 0xFFu; }

fn flush() {
  if cachedIndex != 0xFFFFFFFFu { output[cachedIndex] = cachedWord; }
}

fn writeByte(i: u32, value: u32) {
  let index = i >> 2u;
  if index != cachedIndex {
    flush();
    cachedIndex = index;
    cachedWord = output[index];
  }
  let shift = (i & 3u) * 8u;
  cachedWord = (cachedWord & ~(0xFFu << shift)) | (value << shift);
}

// One strip or tile per workgroup: TIFF LZW is MSB-first with early code width changes.
@compute @workgroup_size(1) fn lzw(@builtin(workgroup_id) id: vec3u) {
  if id.x >= params.count { return; }
  let job = jobs[id.x];
  for (var i = 0u; i < 256u; i++) { table[i] = (i << 12u) | 1u; }
  var next = 258u;
  var width = 9u;
  var prev = 0xFFFFFFFFu;
  var bit = 0u;
  let bits = job.inputLength * 8u;
  var out = 0u;
  loop {
    if bit + width > bits || out >= job.outputLength { break; }
    let p = job.input + (bit >> 3u);
    let window = (byteAt(p) << 16u) | (byteAt(p + 1u) << 8u) | byteAt(p + 2u);
    let code = (window >> (24u - (bit & 7u) - width)) & ((1u << width) - 1u);
    bit += width;
    if code == 256u { next = 258u; width = 9u; prev = 0xFFFFFFFFu; continue; }
    if code == 257u { break; }
    if prev == 0xFFFFFFFFu {
      writeByte(job.output + out, code & 0xFFu);
      out += 1u;
      prev = code;
      continue;
    }
    var first = 0u;
    var length = 0u;
    if code < next {
      length = table[code] & 0xFFFu;
      if out + length > job.outputLength { break; }
      var c = code;
      for (var k = length; k > 0u; k--) {
        let e = table[c];
        first = (e >> 12u) & 0xFFu;
        writeByte(job.output + out + k - 1u, first);
        c = e >> 20u;
      }
    } else {
      length = (table[prev] & 0xFFFu) + 1u;
      if out + length > job.outputLength { break; }
      var c = prev;
      for (var k = length - 1u; k > 0u; k--) {
        let e = table[c];
        first = (e >> 12u) & 0xFFu;
        writeByte(job.output + out + k - 1u, first);
        c = e >> 20u;
      }
      writeByte(job.output + out + length - 1u, first);
    }
    out += length;
    if next < 4096u {
      table[next] = (prev << 20u) | (first << 12u) | ((table[prev] & 0xFFFu) + 1u);
      next += 1u;
    }
    if next + 1u >= (1u << width) && width < 12u { width += 1u; }
    prev = code;
  }
  flush();
}
