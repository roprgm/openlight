@group(0) @binding(0) var source: texture_2d<f32>;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy) * 2;
  let end = vec2i(textureDimensions(source)) - 1;
  var color = vec3f(0.0);
  var weight = 0.0;
  var mask = 0.0;
  for (var y = 0; y < 2; y++) {
    for (var x = 0; x < 2; x++) {
      let sample = textureLoad(source, min(p + vec2i(x, y), end), 0);
      let known = 1.0 - sample.a;
      color += sample.rgb * known;
      weight += known;
      mask = max(mask, sample.a);
    }
  }
  return vec4f(color / max(weight, 1.0), mask);
}
