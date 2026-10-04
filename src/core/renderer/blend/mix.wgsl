import { gradientCoverage, modifierCoverage } from "./coverage.wgsl";

struct Params {
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
@group(0) @binding(0) var original: texture_2d<f32>;
@group(0) @binding(1) var edited: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> modifiers: array<vec4f>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let before = textureLoad(original, vec2i(position.xy), 0);
 let after = textureLoad(edited, vec2i(position.xy), 0);
 var coverage = 1.0;
 if (params.kind != 0u) {
  let at = position.xy * params.scale;
  coverage = gradientCoverage(at, params.first, params.second, params.kind, params.feather, params.angle);
  for (var i = 0u; i < params.modifierCount; i++) {
 coverage = modifierCoverage(coverage, at, modifiers[i * 3u], modifiers[i * 3u + 1u], modifiers[i * 3u + 2u]);
  }
 }
 coverage *= params.opacity;
 return vec4f(mix(before.rgb, after.rgb, coverage), before.a);
}
