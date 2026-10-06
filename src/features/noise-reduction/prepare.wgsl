// Packs each 2 × 2 cell of the mosaic into one texel of the filter's spectrum, where noise is unit
// Gaussian everywhere.
import { Noise, stabilize, toSpectrum } from "./stabilize.wgsl";
import { pack } from "./texels.wgsl";

@group(0) @binding(0) var samples: texture_2d<u32>;
@group(0) @binding(1) var<uniform> noise: Noise;
@group(0) @binding(2) var<uniform> size: vec2u;
@group(0) @binding(3) var<storage, read_write> output: array<vec2u>;

@compute @workgroup_size(8, 8) fn prepare(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= size)) {
    return;
  }
  let p = vec2i(id.xy * 2u);
  let cell = vec4f(
    f32(textureLoad(samples, p, 0).r),
    f32(textureLoad(samples, p + vec2i(1, 0), 0).r),
    f32(textureLoad(samples, p + vec2i(0, 1), 0).r),
    f32(textureLoad(samples, p + vec2i(1, 1), 0).r),
  );
  output[id.y * size.x + id.x] = pack(toSpectrum(stabilize(cell - noise.black, noise), noise));
}
