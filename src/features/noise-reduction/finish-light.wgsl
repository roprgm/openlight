// A filtered light spectrum back to full size: each 2 × 2 cell's pixels from its Haar transform.
import { haar } from "./opponent.wgsl";
import { unpack } from "./texels.wgsl";

@group(0) @binding(0) var<uniform> size: vec2u;
@group(0) @binding(1) var<storage, read> spectrum: array<vec2u>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2u(position.xy);
  let cell = p / 2u;
  let pixels = haar * unpack(spectrum[cell.y * size.x + cell.x]);
  return vec4f(pixels[(p.y & 1u) * 2u + (p.x & 1u)], 0.0, 0.0, 1.0);
}
