import { gradientCoverage } from "../blend/coverage.wgsl";

// One gradient's coverage at source resolution, scaled by its strength; the pass blend adds or subtracts it.
struct Params {
  kind: u32,
  first: vec2f,
  second: vec2f,
  feather: f32,
  angle: f32,
  opacity: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let coverage = gradientCoverage(position.xy, params.first, params.second, params.kind, params.feather, params.angle);
  return vec4f(coverage * params.opacity, 0.0, 0.0, 1.0);
}
