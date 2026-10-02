struct Params { origin: vec2f, extent: vec2f, dimensions: vec2f, grid: vec2f, texel: vec2f, fieldOrigin: vec2f, fieldScale: f32 }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = params.origin + position.xy / params.grid * params.extent;
  let cell = vec2i(floor((p - params.fieldOrigin) / params.fieldScale));
  if (any(cell < vec2i(0)) || any(cell >= vec2i(textureDimensions(field)))) { return vec4f(0.0); }
  let offset = textureLoad(field, cell, 0).xy;
  if (all(offset == vec2f(0.0))) { return vec4f(0.0); }
  let donor = p + round(offset * params.fieldScale / params.texel) * params.texel;
  let color = textureSampleLevel(source, linearSampler, donor / params.dimensions, 0.0);
  return vec4f(color.rgb, 1.0);
}
