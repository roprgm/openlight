@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var field: texture_2d<f32>;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let original = textureLoad(source, p, 0);
  if (original.a < 0.5) { return original; }
  let end = vec2i(textureDimensions(source)) - 1;
  var color = vec3f(0.0);
  var weight = 0.0;
  for (var y = -2; y <= 2; y += 2) {
    for (var x = -2; x <= 2; x += 2) {
      let center = clamp(p + vec2i(x, y), vec2i(0), end);
      let correspondence = textureLoad(field, center, 0);
      if (correspondence.w < 0.5) { continue; }
      let donor = clamp(p + vec2i(correspondence.xy), vec2i(0), end);
      let sample = textureLoad(source, donor, 0);
      if (sample.a > 0.5) { continue; }
      let confidence = exp(-min(correspondence.z * 80.0, 20.0));
      color += sample.rgb * confidence;
      weight += confidence;
    }
  }
  let averaged = color / max(weight, 0.000001);
  return vec4f(averaged, original.a);
}
