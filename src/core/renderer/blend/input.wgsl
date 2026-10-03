import { combineCoverage, gradientCoverage } from "./coverage.wgsl";

// The image a curve receives, with gradient coverage as alpha, drawn on the histogram's grid: each
// texel reads the image texel the histogram would read there at full size.
struct Params {
 kind: u32,
 first: vec2f,
 second: vec2f,
 feather: f32,
 angle: f32,
 modifierCount: u32,
 // The grid's size, and source pixels per image texel.
 grid: vec2u,
 imageScale: vec2f,
}
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> modifiers: array<vec4f>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let read = vec2u(position.xy) * textureDimensions(image) / params.grid;
 let color = textureLoad(image, read, 0);
 var coverage = 1.0;
 if (params.kind != 0u) {
  let at = (vec2f(read) + 0.5) * params.imageScale;
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
