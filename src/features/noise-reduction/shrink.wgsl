// One step of sliding DCT denoising (Yu and Sapiro, 2011), the patch filter BM3D builds on (Dabov,
// Foi, Katkovnik, and Egiazarian, 2007), over a tile of the spectrum per workgroup: every 8 × 8 patch
// that reaches the tile is transformed, shrunk, and added back to the texels it covers, weighted by
// how little of it survived. The first step keeps the coefficients that stand out of the noise; the
// second shrinks each by the Wiener weight the first step's estimate gives it. Patches are filtered
// alone rather than grouped with similar ones, which would mistake aligned noise for likeness.
import { pack, unpack } from "./texels.wgsl";

const side = 8u;
const tile = 32u;
// Patches whose texels reach the tile, along each side.
const span = 39u;
const threads = 256u;
// Coefficients below this many noise deviations are noise, in the first step; the greens' difference
// holds less detail than light and color.
const lambda = vec4f(3.0, 3.0, 3.0, 3.5);
// How much more each component's noise counts in the Wiener weights: color, and more so the greens'
// difference, shrink harder than light.
const caution = vec4f(1.0, 2.0, 2.0, 8.0);
// Fixed-point scales of the sums. Light, the largest component, reaches twice the transform's largest
// value, 1024, and ringing at most doubles it; the 64 patches over a texel weigh 36 at most, in their
// Kaiser windows. Both sums stay in range.
const valueScale = 8192.0;
const weightScale = 16777216.0;
const kaiser = array<f32, 8>(0.438676, 0.681324, 0.87684, 0.985823, 0.985823, 0.87684, 0.681324, 0.438676);

struct Params {
  size: vec2u,
  // Components the spectrum holds: four for a mosaic, three for an image.
  channels: u32,
  // Each component's noise deviation.
  sigma: vec4f,
  // 0 thresholds; 1 shrinks by the Wiener weights of `pilot`, the first step's estimate.
  wiener: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> noisy: array<vec2u>;
@group(0) @binding(2) var<storage, read> pilot: array<vec2u>;
@group(0) @binding(3) var<storage, read_write> output: array<vec2u>;

// The 8-point DCT basis, [frequency][position].
var<workgroup> basis: array<f32, 64>;
var<workgroup> sums: array<atomic<i32>, 1024>;
var<workgroup> weights: array<atomic<u32>, 1024>;

// A texel past the edge reads the image mirrored there, so patches cover the edge as fully as the rest.
fn mirrored(p: vec2i) -> u32 {
  let last = vec2i(params.size) - 1;
  let q = min(abs(p), 2 * last - p);
  return u32(q.y) * params.size.x + u32(q.x);
}

// The 2D DCT of a block, or its inverse, separably along rows and then columns.
fn transform(block: ptr<function, array<f32, 64>>, inverse: bool) {
  var line: array<f32, 8>;
  for (var step = 0u; step < 2u; step++) {
    for (var a = 0u; a < 8u; a++) {
      for (var k = 0u; k < 8u; k++) {
        var sum = 0.0;
        for (var i = 0u; i < 8u; i++) {
          let b = select(basis[k * 8u + i], basis[i * 8u + k], inverse);
          sum += b * (*block)[select(a * 8u + i, i * 8u + a, step == 1u)];
        }
        line[k] = sum;
      }
      for (var k = 0u; k < 8u; k++) {
        (*block)[select(a * 8u + k, k * 8u + a, step == 1u)] = line[k];
      }
    }
  }
}

@compute @workgroup_size(16, 16) fn shrink(
  @builtin(workgroup_id) cell: vec3u,
  @builtin(local_invocation_index) t: u32,
) {
  let frequency = (t / 8u) % 8u;
  let position = t % 8u;
  if (t < 64u) {
    basis[t] = select(0.5, 0.35355339, frequency == 0u) * cos(f32((2u * position + 1u) * frequency) * 0.19634954);
  }
  let origin = vec2i(cell.xy * tile);
  var results: array<vec4f, 4>;
  for (var channel = 0u; channel < params.channels; channel++) {
    for (var i = t; i < tile * tile; i += threads) {
      atomicStore(&sums[i], 0);
      atomicStore(&weights[i], 0u);
    }
    workgroupBarrier();
    let sigma = params.sigma[channel];
    for (var i = t; i < span * span; i += threads) {
      let corner = origin - i32(side - 1u) + vec2i(vec2u(i % span, i / span));
      var values: array<f32, 64>;
      var guide: array<f32, 64>;
      for (var j = 0u; j < 64u; j++) {
        let index = mirrored(corner + vec2i(vec2u(j % 8u, j / 8u)));
        values[j] = unpack(noisy[index])[channel];
        if (params.wiener == 1u) {
          guide[j] = unpack(pilot[index])[channel];
        }
      }
      transform(&values, false);
      if (params.wiener == 1u) {
        transform(&guide, false);
      }
      // A patch's mean, its DC, stays whole: the inverse transform expects every level unbiased. Not
      // the greens' difference: both greens see the same light, so its mean is noise or imbalance,
      // which demosaicing would draw as a maze.
      var kept = 0.0;
      for (var j = 0u; j < 64u; j++) {
        if (j == 0u && channel != 3u) {
          kept += 1.0;
        } else if (params.wiener == 1u) {
          let g = guide[j] * guide[j];
          let w = g / (g + caution[channel] * sigma * sigma);
          values[j] *= w;
          kept += w * w;
        } else if (abs(values[j]) > lambda[channel] * sigma) {
          kept += 1.0;
        } else {
          values[j] = 0.0;
        }
      }
      transform(&values, true);
      let weight = 1.0 / max(kept, 1.0);
      for (var j = 0u; j < 64u; j++) {
        let p = corner + vec2i(vec2u(j % 8u, j / 8u)) - origin;
        if (all(p >= vec2i(0)) && all(p < vec2i(i32(tile)))) {
          let w = weight * kaiser[j % 8u] * kaiser[j / 8u];
          let index = u32(p.y) * tile + u32(p.x);
          atomicAdd(&sums[index], i32(round(values[j] * w * valueScale)));
          atomicAdd(&weights[index], u32(round(w * weightScale)));
        }
      }
    }
    workgroupBarrier();
    for (var k = 0u; k < 4u; k++) {
      let i = t + k * threads;
      let value = f32(atomicLoad(&sums[i])) / valueScale;
      let weight = f32(atomicLoad(&weights[i])) / weightScale;
      results[k][channel] = value / weight;
    }
    workgroupBarrier();
  }
  for (var k = 0u; k < 4u; k++) {
    let i = t + k * threads;
    let p = vec2u(origin) + vec2u(i % tile, i / tile);
    if (all(p < params.size)) {
      output[p.y * params.size.x + p.x] = pack(results[k]);
    }
  }
}
