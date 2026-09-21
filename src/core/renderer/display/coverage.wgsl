// Box-averages a coverage raster into a small gray preview: near black where nothing is covered, white where all is.
@group(0) @binding(0) var coverage: texture_2d<f32>;
@group(0) @binding(1) var<uniform> size: vec2f;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let source = vec2f(textureDimensions(coverage));
  let block = max(vec2i(ceil(source / size)), vec2i(1));
  let origin = vec2i(floor(uv * source - vec2f(block) * 0.5));
  let limit = vec2i(source) - 1;
  var total = 0.0;
  for (var y = 0; y < block.y; y++) {
    for (var x = 0; x < block.x; x++) {
      total += textureLoad(coverage, clamp(origin + vec2i(x, y), vec2i(0), limit), 0).r;
    }
  }
  let value = total / f32(block.x * block.y);
  return vec4f(mix(vec3f(0.039), vec3f(1.0), value), 1.0);
}
