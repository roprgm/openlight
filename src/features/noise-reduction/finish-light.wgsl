// A filtered image spectrum's light, at full size.
import { unpack } from "./texels.wgsl";

@group(0) @binding(0) var<uniform> size: vec2u;
@group(0) @binding(1) var<storage, read> spectrum: array<vec2u>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2u(position.xy);
  return vec4f(unpack(spectrum[p.y * size.x + p.x]).x, 0.0, 0.0, 1.0);
}
