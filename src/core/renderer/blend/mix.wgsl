struct Params {
 opacity: f32,
 masked: u32,
 start: vec2f,
 end: vec2f,
}
@group(0) @binding(0) var original: texture_2d<f32>;
@group(0) @binding(1) var edited: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let before = textureLoad(original, vec2i(position.xy), 0);
 let after = textureLoad(edited, vec2i(position.xy), 0);
 var coverage = params.opacity;
 if (params.masked != 0u) {
  let direction = params.end - params.start;
  coverage *= 1.0 - clamp(dot(position.xy - params.start, direction) / dot(direction, direction), 0.0, 1.0);
 }
 return vec4f(mix(before.rgb, after.rgb, coverage), before.a);
}
