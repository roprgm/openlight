// Packs each 2 × 2 cell of the mosaic into one texel of the filter's spectrum, where noise is unit
// Gaussian everywhere. A sample that stands far above both its same-color neighbors and every
// adjacent one is a hot pixel rather than light, which would also reach its neighbors through the
// lens, and takes its brightest same-color neighbor's value.
import { Noise, stabilize, toSpectrum } from "./stabilize.wgsl";
import { pack } from "./texels.wgsl";

// How many noise deviations a hot pixel stands out by.
const outlier = 5.0;

@group(0) @binding(0) var samples: texture_2d<u32>;
@group(0) @binding(1) var<uniform> noise: Noise;
@group(0) @binding(2) var<uniform> size: vec2u;
@group(0) @binding(3) var<storage, read_write> output: array<vec2u>;

// The 6 × 6 samples around the cell, stabilized, row by row.
var<private> window: array<f32, 36>;

fn at(x: i32, y: i32) -> f32 {
  return window[y * 6 + x];
}

@compute @workgroup_size(8, 8) fn prepare(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= size)) {
    return;
  }
  for (var j = 0; j < 9; j++) {
    let offset = vec2i(j % 3, j / 3);
    let cell = clamp(vec2i(id.xy) + offset - 1, vec2i(0), vec2i(size) - 1);
    let p = cell * 2;
    let z = stabilize(vec4f(
      f32(textureLoad(samples, p, 0).r),
      f32(textureLoad(samples, p + vec2i(1, 0), 0).r),
      f32(textureLoad(samples, p + vec2i(0, 1), 0).r),
      f32(textureLoad(samples, p + vec2i(1, 1), 0).r),
    ) - noise.black, noise);
    for (var k = 0; k < 4; k++) {
      window[(offset.y * 2 + k / 2) * 6 + offset.x * 2 + k % 2] = z[k];
    }
  }
  var z: vec4f;
  for (var k = 0; k < 4; k++) {
    let x = 2 + k % 2;
    let y = 2 + k / 2;
    let same = max(max(at(x - 2, y), at(x + 2, y)), max(at(x, y - 2), at(x, y + 2)));
    var adjacent = -3.4e38;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx != 0 || dy != 0) {
          adjacent = max(adjacent, at(x + dx, y + dy));
        }
      }
    }
    let value = at(x, y);
    z[k] = select(value, same, value > same + outlier && value > adjacent + outlier);
  }
  output[id.y * size.x + id.x] = pack(toSpectrum(z, noise));
}
