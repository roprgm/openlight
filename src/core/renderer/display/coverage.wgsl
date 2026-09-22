// Box-averages a region of a coverage raster into a small gray preview: near black where nothing is covered, white where all is.
struct Params {
  size: vec2f,
  origin: vec2f,
  extent: vec2f,
}
@group(0) @binding(0) var coverage: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let limit = vec2i(textureDimensions(coverage)) - 1;
  let block = max(vec2i(ceil(params.extent / params.size)), vec2i(1));
  let origin = vec2i(floor(params.origin + uv * params.extent - vec2f(block) * 0.5));
  var total = 0.0;
  for (var y = 0; y < block.y; y++) {
    for (var x = 0; x < block.x; x++) {
      let texel = origin + vec2i(x, y);
      // A region reaching past the raster, such as a square around a patch at the edge, shows nothing there.
      if (all(texel >= vec2i(0)) && all(texel <= limit)) {
        total += textureLoad(coverage, texel, 0).r;
      }
    }
  }
  let value = total / f32(block.x * block.y);
  return vec4f(mix(vec3f(0.039), vec3f(1.0), value), 1.0);
}
