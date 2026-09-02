@group(0) @binding(0) var source: texture_2d<f32>;

// Linear sRGB primaries to Rec.2020, the working space (column-major).
const srgbToRec2020 = mat3x3f(
  0.6274, 0.0691, 0.0164,
  0.3293, 0.9195, 0.0880,
  0.0433, 0.0114, 0.8956,
);

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let texel = textureLoad(source, vec2i(position.xy), 0);
  return vec4f(srgbToRec2020 * texel.rgb, texel.a);
}
