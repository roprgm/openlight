import { adjustLayer } from "../../features/adjustments/adjust.wgsl";
import { Adjustments } from "../../features/adjustments/prepare.wgsl";
import { tone, toneSamples } from "../../features/tone-curves/tone.wgsl";

// A mask's adjustments and curve, mixed into the image below through rasterized coverage, sampled by
// position so any proxy resolution reads the same mask.
struct Params {
 exposureOnly: u32,
 // 0 for an identity curve, which the separate curve pass skips.
 curved: u32,
 opacity: f32,
}
@group(0) @binding(0) var below: texture_2d<f32>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var coverageSampler: sampler;
@group(0) @binding(3) var<uniform> adjustments: Adjustments;
@group(0) @binding(4) var<uniform> params: Params;
@group(0) @binding(5) var<storage, read> curve: array<f32>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let before = textureLoad(below, vec2i(position.xy), 0);
 var after = adjustLayer(before.rgb, adjustments, params.exposureOnly != 0u);
 if (params.curved != 0u) {
  let size = arrayLength(&curve);
  let at = toneSamples(after, size);
  after = tone(after, vec4f(curve[at.x], curve[at.y], curve[at.z], curve[at.w]), size);
 }
 let uv = position.xy / vec2f(textureDimensions(below));
 let covered = textureSampleLevel(coverage, coverageSampler, uv, 0.0).r;
 return vec4f(mix(before.rgb, after, covered * params.opacity), before.a);
}
