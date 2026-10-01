struct Params { origin: vec2f, extent: vec2f, dimensions: vec2f, grid: vec2f, texel: vec2f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / params.grid;
  let p = params.origin + uv * params.extent;
  let cell = clamp(vec2i(uv * vec2f(textureDimensions(field))), vec2i(0), vec2i(textureDimensions(field)) - 1);
  let correspondence = textureLoad(field, cell, 0);
  let offset = round(correspondence.xy / vec2f(textureDimensions(field)) * params.extent / params.texel) * params.texel;
  let donor = p + offset;
  let color = textureSampleLevel(source, linearSampler, donor / params.dimensions, 0.0);
  return vec4f(color.rgb, correspondence.w);
}
