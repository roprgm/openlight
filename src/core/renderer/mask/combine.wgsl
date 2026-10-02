import { combineCoverage } from "../blend/coverage.wgsl";

// Folds a child mask's coverage into its group's; either may come at another resolution, sampled by position.
struct Params {
 operation: u32,
 opacity: f32,
}
@group(0) @binding(0) var group: texture_2d<f32>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var coverageSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
 let current = textureSampleLevel(group, coverageSampler, uv, 0.0).r;
 let child = textureSampleLevel(coverage, coverageSampler, uv, 0.0).r;
 return vec4f(combineCoverage(current, child, params.operation, params.opacity), 0.0, 0.0, 1.0);
}
