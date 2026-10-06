// How a filtered spectrum changes the mosaic: each 2 × 2 cell's four samples by position, as the
// unbiased inverse returns them, less the decoded ones.
import { fromSpectrum, Noise, unstabilize } from "./stabilize.wgsl";
import { unpack } from "./texels.wgsl";

@group(0) @binding(0) var<uniform> noise: Noise;
@group(0) @binding(1) var<uniform> size: vec2u;
@group(0) @binding(2) var<storage, read> spectrum: array<vec2u>;
@group(0) @binding(3) var samples: texture_2d<u32>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let cell = vec2u(position.xy);
  let p = vec2i(cell * 2u);
  let decoded = vec4f(
    f32(textureLoad(samples, p, 0).r),
    f32(textureLoad(samples, p + vec2i(1, 0), 0).r),
    f32(textureLoad(samples, p + vec2i(0, 1), 0).r),
    f32(textureLoad(samples, p + vec2i(1, 1), 0).r),
  ) - noise.black;
  let z = fromSpectrum(unpack(spectrum[cell.y * size.x + cell.x]), noise);
  return unstabilize(z, noise) - decoded;
}
