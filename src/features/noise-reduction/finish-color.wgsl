// A filtered color spectrum's two differences, as each 2 × 2 cell's mean: a reduced image's color
// holds no detail at that scale, and half its size takes a quarter of the memory.
import { unpack } from "./texels.wgsl";

@group(0) @binding(0) var<uniform> size: vec2u;
@group(0) @binding(1) var<storage, read> spectrum: array<vec2u>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let cell = vec2u(position.xy);
  return vec4f(unpack(spectrum[cell.y * size.x + cell.x]).xy * 0.5, 0.0, 1.0);
}
