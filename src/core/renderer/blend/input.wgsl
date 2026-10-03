import { combineCoverage, gradientCoverage } from "./coverage.wgsl";

// The image a curve receives, with gradient coverage as alpha, drawn at the histogram's few texels:
// each reads one image texel, as the histogram counted them at full size, from the texel's own column.
struct Params {
 kind: u32,
 first: vec2f,
 second: vec2f,
 feather: f32,
 angle: f32,
 modifierCount: u32,
 // Image texels per input texel, and source pixels per image texel.
 ratio: vec2f,
 imageScale: vec2f,
}
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> modifiers: array<vec4f>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let read = floor(floor(position.xy) * params.ratio);
 let color = textureLoad(image, vec2i(read), 0);
 var coverage = 1.0;
 if (params.kind != 0u) {
  let at = (read + 0.5) * params.imageScale;
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
