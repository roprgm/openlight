// A filtered image spectrum's two color differences, averaged over 2 × 2 pixels: a reduced image's
// color holds no detail at that scale, and half its size takes a quarter of the memory.
import { unpack } from "./texels.wgsl";

@group(0) @binding(0) var<uniform> size: vec2u;
@group(0) @binding(1) var<storage, read> spectrum: array<vec2u>;

fn colorAt(p: vec2u) -> vec2f {
  let q = min(p, size - 1u);
  return unpack(spectrum[q.y * size.x + q.x]).yz;
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2u(position.xy) * 2u;
  let sum = colorAt(p) + colorAt(p + vec2u(1u, 0u)) + colorAt(p + vec2u(0u, 1u)) + colorAt(p + 1u);
  return vec4f(sum * 0.25, 0.0, 1.0);
}
