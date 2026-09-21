// Box-filters factor × factor source texels into one; edge blocks repeat the last texel.
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> factor: i32;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let origin = vec2i(position.xy) * factor;
  let limit = vec2i(textureDimensions(source)) - 1;
  var total = vec4f(0.0);
  for (var y = 0; y < factor; y++) {
    for (var x = 0; x < factor; x++) {
      total += textureLoad(source, min(origin + vec2i(x, y), limit), 0);
    }
  }
  return total / f32(factor * factor);
}
