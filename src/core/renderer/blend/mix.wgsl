struct Params {
 opacity: f32,
 masked: u32,
 start: vec2f,
 end: vec2f,
 modifierCount: u32,
}
@group(0) @binding(0) var original: texture_2d<f32>;
@group(0) @binding(1) var edited: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> modifiers: array<vec4f>;

fn gradientCoverage(position: vec2f, start: vec2f, end: vec2f) -> f32 {
 let direction = end - start;
 return 1.0 - clamp(dot(position - start, direction) / dot(direction, direction), 0.0, 1.0);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let before = textureLoad(original, vec2i(position.xy), 0);
 let after = textureLoad(edited, vec2i(position.xy), 0);
 var coverage = 1.0;
 if (params.masked != 0u) {
  coverage = gradientCoverage(position.xy, params.start, params.end);
  for (var i = 0u; i < params.modifierCount; i++) {
   let points = modifiers[i * 2u];
   let amount = modifiers[i * 2u + 1u].x;
   coverage = clamp(coverage + gradientCoverage(position.xy, points.xy, points.zw) * amount, 0.0, 1.0);
  }
 }
 coverage *= params.opacity;
 return vec4f(mix(before.rgb, after.rgb, coverage), before.a);
}
