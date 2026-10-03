import { combineCoverage, gradientCoverage } from "../../core/renderer/blend/coverage.wgsl";
import { adjustLayer } from "../../features/adjustments/adjust.wgsl";
import { Adjustments } from "../../features/adjustments/prepare.wgsl";
import { tone, toneSamples } from "../../features/tone-curves/tone.wgsl";

// A mask's adjustments and curve, mixed into the image below through gradient coverage.
struct Params {
 exposureOnly: u32,
 // 0 for an identity curve, which the separate curve pass skips.
 curved: u32,
 opacity: f32,
 kind: u32,
 first: vec2f,
 second: vec2f,
 feather: f32,
 angle: f32,
 modifierCount: u32,
 // Source pixels per texel, so a reduced proxy evaluates gradients at the same document positions.
 scale: vec2f,
}
@group(0) @binding(0) var below: texture_2d<f32>;
@group(0) @binding(1) var<uniform> adjustments: Adjustments;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> curve: array<f32>;
@group(0) @binding(4) var<storage, read> modifiers: array<vec4f>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let before = textureLoad(below, vec2i(position.xy), 0);
 // Rounded to half floats where the separate passes' textures round, so inspecting the mask changes nothing.
 var after = quantizeToF16(adjustLayer(before.rgb, adjustments, params.exposureOnly != 0u));
 if (params.curved != 0u) {
  let size = arrayLength(&curve);
  let at = toneSamples(after, size);
  after = quantizeToF16(tone(after, vec4f(curve[at.x], curve[at.y], curve[at.z], curve[at.w]), size));
 }
 let at = position.xy * params.scale;
 var coverage = gradientCoverage(at, params.first, params.second, params.kind, params.feather, params.angle);
 for (var i = 0u; i < params.modifierCount; i++) {
  let points = modifiers[i * 3u];
  let settings = modifiers[i * 3u + 1u];
  let child = gradientCoverage(at, points.xy, points.zw, u32(settings.y), settings.z, settings.w);
  coverage = combineCoverage(coverage, child, u32(modifiers[i * 3u + 2u].x), settings.x);
 }
 return vec4f(mix(before.rgb, after, coverage * params.opacity), before.a);
}
