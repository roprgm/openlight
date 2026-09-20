struct Params {
  intensity: f32,
  softness: f32,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  // Source-relative elliptical distance: zero at the image center, one at its corners.
  let offset = position.xy / vec2f(textureDimensions(source)) - 0.5;
  let radius = length(offset) * sqrt(2.0);
  let start = 0.75 * (1.0 - params.softness / 100.0);
  let gain = 1.0 - params.intensity / 100.0 * smoothstep(start, 1.0, radius);
  return vec4f(input.rgb * gain, input.a);
}
