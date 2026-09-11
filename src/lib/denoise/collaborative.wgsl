// Two-stage BM3D-style collaborative filtering: DCT8 x DCT8 x Walsh.
// Independent implementation from the published algorithm; no reference binaries.
struct Params { origin: vec2i, size: vec2i, stage: u32, variance: array<vec4f, 16> }
struct Accumulator { value: array<atomic<u32>, 8> }
@group(0) @binding(0) var noisy: texture_2d<f32>;
@group(0) @binding(1) var guide: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> accumulated: array<Accumulator>;
var<workgroup> data: array<vec4f, 512>;
var<workgroup> reference: array<vec4f, 64>;
var<workgroup> distances: array<f32, 192>;
var<workgroup> matches: array<vec2i, 8>;
var<workgroup> count: u32;
var<workgroup> energies: array<vec4f, 64>;
var<workgroup> variances: array<vec4f, 64>;
const BASIS = array<f32, 64>(
  0.3535533906, 0.3535533906, 0.3535533906, 0.3535533906, 0.3535533906, 0.3535533906, 0.3535533906, 0.3535533906,
  0.4903926402, 0.4157348062, 0.2777851165, 0.0975451610, -0.0975451610, -0.2777851165, -0.4157348062, -0.4903926402,
  0.4619397663, 0.1913417162, -0.1913417162, -0.4619397663, -0.4619397663, -0.1913417162, 0.1913417162, 0.4619397663,
  0.4157348062, -0.0975451610, -0.4903926402, -0.2777851165, 0.2777851165, 0.4903926402, 0.0975451610, -0.4157348062,
  0.3535533906, -0.3535533906, -0.3535533906, 0.3535533906, 0.3535533906, -0.3535533906, -0.3535533906, 0.3535533906,
  0.2777851165, -0.4903926402, 0.0975451610, 0.4157348062, -0.4157348062, -0.0975451610, 0.4903926402, -0.2777851165,
  0.1913417162, -0.4619397663, 0.4619397663, -0.1913417162, -0.1913417162, 0.4619397663, -0.4619397663, 0.1913417162,
  0.0975451610, -0.2777851165, 0.4157348062, -0.4903926402, 0.4903926402, -0.4157348062, 0.2777851165, -0.0975451610
);
// Positive triangular window sampled at pixel centers: 1 - abs((2*i+1)/8 - 1).
fn window(i: u32) -> f32 { return 1.0 - abs((2.0 * f32(i) + 1.0) / 8.0 - 1.0); }
// The packed image is already in an orthonormal RGB opponent basis.
fn noiseVariance(signal: vec4f) -> vec4f {
  let position = clamp(signal.x * 0.5773502692, 0.0, 1.0) * 15.0;
  let lower = u32(position);
  return max(mix(params.variance[lower], params.variance[min(lower + 1u, 15u)], fract(position)), vec4f(1e-10));
}

// Propagate marginal variances through the squared spatial basis. Walsh rows
// have identical squared weights, so average over group members before the DCT.
// This approximation omits covariance from overlapping selected patches.
fn transformVariance(lane: u32) {
  for (var axis = 0u; axis < 2u; axis++) {
    let x = lane % 8u;
    let y = lane / 8u;
    let coord = select(x, y, axis == 1u);
    var sum = vec4f(0.0);
    for (var k = 0u; k < 8u; k++) {
      let basis = BASIS[coord * 8u + k];
      let index = select(y * 8u + k, k * 8u + x, axis == 1u);
      sum += variances[index] * basis * basis;
    }
    workgroupBarrier();
    variances[lane] = sum;
    workgroupBarrier();
  }
}

fn loadNoisy(p: vec2i) -> vec4f { return vec4f(textureLoad(noisy, clamp(p, vec2i(0), params.size - 1), 0).rgb, 0.0); }
fn loadGuide(p: vec2i) -> vec4f { return vec4f(textureLoad(guide, clamp(p, vec2i(0), params.size - 1), 0).rgb, 0.0); }

fn spatial(lane: u32, inverse: bool) {
  let x = lane % 8u;
  let y = lane / 8u;
  var next: array<vec4f, 8>;
  for (var axis = 0u; axis < 2u; axis++) {
    for (var g = 0u; g < 8u; g++) {
      var sum = vec4f(0.0);
      for (var k = 0u; k < 8u; k++) {
        let coord = select(x, y, axis == 1u);
        let b = select(coord * 8u + k, k * 8u + coord, inverse);
        let index = select(y * 8u + k, k * 8u + x, axis == 1u);
        sum += data[g * 64u + index] * BASIS[b];
      }
      next[g] = sum;
    }
    workgroupBarrier();
    for (var g = 0u; g < 8u; g++) { data[g * 64u + lane] = next[g]; }
    workgroupBarrier();
  }
}

fn groups(lane: u32) {
  var next: array<vec4f, 8>;
  for (var step = 1u; step < 8u; step *= 2u) {
    for (var g = 0u; g < 8u; g++) {
      let a = data[g * 64u + lane];
      let b = data[(g ^ step) * 64u + lane];
      next[g] = a;
      if step < count { next[g] = select(a + b, b - a, (g & step) != 0u) * 0.7071067811865476; }
    }
    workgroupBarrier();
    for (var g = 0u; g < 8u; g++) { data[g * 64u + lane] = next[g]; }
    workgroupBarrier();
  }
}

// WebGPU has integer atomics. CAS implements FP32 overlap-add without fixed-point overflow.
fn add(index: u32, channel: u32, value: f32) {
  var old = atomicLoad(&accumulated[index].value[channel]);
  loop {
    let result = atomicCompareExchangeWeak(&accumulated[index].value[channel], old, bitcast<u32>(bitcast<f32>(old) + value));
    if result.exchanged { break; }
    old = result.old_value;
  }
}

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) lane: u32) {
  // Reference origins extend far enough to include every group that can contribute to this tile.
  let origin = params.origin - 20 + vec2i(group.xy) * 4;
  if any(origin < vec2i(-4)) || any(origin >= params.size) { return; }
  let pixel = vec2i(i32(lane % 8u), i32(lane / 8u));
  reference[lane] = loadGuide(origin + pixel);
  workgroupBarrier();
  for (var candidate = lane; candidate < 192u; candidate += 64u) {
    var distance = 1e20;
    let offset = (vec2i(i32(candidate % 13u), i32(candidate / 13u)) - 6) * 2;
    let p = origin + offset;
    if candidate < 169u && any(offset != vec2i(0)) && all(p >= vec2i(-4)) && all(p < params.size) {
      var sum = 0.0;
      for (var k = 0u; k < 64u; k++) {
        let sample = loadGuide(p + vec2i(i32(k % 8u), i32(k / 8u)));
        let d = sample - reference[k];
        let variance = noiseVariance((sample + reference[k]) * 0.5);
        // A few extreme samples must not exclude an otherwise matching patch.
        // Broad edges still contribute across many pixels; isolated spikes have bounded influence.
        sum += dot(min(d * d / variance, vec4f(16.0)), vec4f(1.0));
      }
      distance = sum / 192.0;
    }
    distances[candidate] = distance;
  }
  workgroupBarrier();
  if lane == 0u {
    matches[0] = origin;
    var found = 1u;
    for (var g = 1u; g < 8u; g++) {
      var best = 1e20;
      var index = 0u;
      for (var c = 0u; c < 169u; c++) {
        if distances[c] < best { best = distances[c]; index = c; }
      }
      matches[g] = origin + (vec2i(i32(index % 13u), i32(index / 13u)) - 6) * 2;
      if best < select(3.0, 1.0, params.stage == 1u) { found += 1u; }
      distances[index] = 1e20;
    }
    count = select(select(1u, 2u, found >= 2u), select(4u, 8u, found >= 8u), found >= 4u);
  }
  workgroupBarrier();
  var variance = vec4f(0.0);
  for (var g = 0u; g < 8u; g++) {
    data[g * 64u + lane] = vec4f(0.0);
    if g < count {
      data[g * 64u + lane] = loadNoisy(matches[g] + pixel);
      variance += noiseVariance(loadGuide(matches[g] + pixel));
    }
  }
  variances[lane] = variance / f32(count);
  workgroupBarrier();
  transformVariance(lane);
  spatial(lane, false);
  groups(lane);
  var coefficients: array<vec4f, 8>;
  for (var g = 0u; g < 8u; g++) { coefficients[g] = data[g * 64u + lane]; }
  workgroupBarrier();
  if params.stage == 1u {
    for (var g = 0u; g < 8u; g++) {
      data[g * 64u + lane] = vec4f(0.0);
      if g < count { data[g * 64u + lane] = loadGuide(matches[g] + pixel); }
    }
  }
  workgroupBarrier();
  // Uniform stage flag; all invocations follow the same transform schedule.
  if params.stage == 1u { spatial(lane, false); groups(lane); }
  var energy = vec4f(0.0);
  for (var g = 0u; g < 8u; g++) {
    var gain = select(vec4f(0.0), vec4f(1.0), abs(coefficients[g]) >= 2.7 * sqrt(variances[lane]));
    if params.stage == 1u {
      let power = data[g * 64u + lane] * data[g * 64u + lane];
      gain = power / (power + variances[lane]);
    }
    if lane == 0u && g == 0u { gain = vec4f(1.0); }
    if g >= count { gain = vec4f(0.0); }
    coefficients[g] *= gain;
    energy += gain * gain * variances[lane];
  }
  workgroupBarrier();
  for (var g = 0u; g < 8u; g++) { data[g * 64u + lane] = coefficients[g]; }
  energies[lane] = energy;
  workgroupBarrier();
  for (var step = 32u; step > 0u; step /= 2u) {
    var sum = energies[lane];
    if lane < step { sum += energies[lane + step]; }
    workgroupBarrier();
    energies[lane] = sum;
    workgroupBarrier();
  }
  groups(lane);
  spatial(lane, true);
  let weight = window(lane % 8u) * window(lane / 8u) / max(energies[0], vec4f(1e-10));
  for (var g = 0u; g < 8u; g++) {
    let p = matches[g] + pixel - params.origin;
    if g < count && all(p >= vec2i(0)) && all(p < vec2i(128)) && all(p + params.origin < params.size) {
      let index = u32(p.y * 128 + p.x);
      let value = data[g * 64u + lane] * weight;
      for (var c = 0u; c < 4u; c++) {
        add(index, c, value[c]);
        add(index, c + 4u, weight[c]);
      }
    }
  }
}
