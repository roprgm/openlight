import { combineCoverage, gradientCoverage } from "./coverage.wgsl";

// The image a curve receives, with gradient coverage as alpha, drawn at the histogram's few texels,
// one source texel each, as the histogram counted them at full size.
struct Params {
 kind: u32,
 first: vec2f,
 second: vec2f,
 feather: f32,
 angle: f32,
 modifierCount: u32,
 // The photo's size in source pixels, where the gradients are drawn.
 sourceSize: vec2f,
}
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> modifiers: array<vec4f>;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
 let color = textureSampleLevel(image, imageSampler, uv, 0.0);
 var coverage = 1.0;
 if (params.kind != 0u) {
  let at = uv * params.sourceSize;
  coverage = gradientCoverage(at, params.first, params.second, params.kind, params.feather, params.angle);
  for (var i = 0u; i < params.modifierCount; i++) {
   let points = modifiers[i * 3u];
   let settings = modifiers[i * 3u + 1u];
   let child = gradientCoverage(at, points.xy, points.zw, u32(settings.y), settings.z, settings.w);
   coverage = combineCoverage(coverage, child, u32(modifiers[i * 3u + 2u].x), settings.x);
  }
 }
 return vec4f(color.rgb, color.a * coverage);
}
