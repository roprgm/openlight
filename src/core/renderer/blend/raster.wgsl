import { sampleRegion } from "../mask/region.wgsl";

// Blends an adjustment through rasterized coverage, sampled by source position so any proxy resolution reads the same mask.
struct Params {
 opacity: f32,
 // 1 returns the edited image with coverage as alpha, for measuring what a mask affects.
 mode: u32,
 // Where the coverage raster starts, in source pixels.
 origin: vec2f,
 // Source pixels per texel of the images.
 scale: vec2f,
}
@group(0) @binding(0) var original: texture_2d<f32>;
@group(0) @binding(1) var edited: texture_2d<f32>;
@group(0) @binding(2) var coverage: texture_2d<f32>;
@group(0) @binding(3) var coverageSampler: sampler;
@group(0) @binding(4) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let before = textureLoad(original, vec2i(position.xy), 0);
 let after = textureLoad(edited, vec2i(position.xy), 0);
 let covered = sampleRegion(coverage, coverageSampler, position.xy * params.scale, params.origin).r;
 if (params.mode == 1u) {
  return vec4f(after.rgb, before.a * covered);
 }
 return vec4f(mix(before.rgb, after.rgb, covered * params.opacity), before.a);
}
