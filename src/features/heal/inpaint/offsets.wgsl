// What a field keeps: each hole texel's offset to its donor, zero where nothing replaces the pixel.
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var field: texture_2d<f32>;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let correspondence = textureLoad(field, p, 0);
  let filled = textureLoad(source, p, 0).a > 0.5 && correspondence.w > 0.5;
  return vec4f(select(vec2f(0.0), correspondence.xy, filled), 0.0, 1.0);
}
